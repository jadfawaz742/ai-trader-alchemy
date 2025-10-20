#!/usr/bin/env python3
"""
FastAPI GPU Training Server
Receives training requests from Supabase Edge Functions and executes PPO training on GPU.
"""

from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
import os
import subprocess
import json
import logging
from dotenv import load_dotenv
from datetime import datetime
from typing import Optional

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="AI Trading GPU Server",
    description="GPU-accelerated PPO training server for financial trading models",
    version="1.0.0"
)

# Track active training jobs
active_jobs = {}


def detect_asset_type(symbol: str) -> tuple[str, str]:
    """
    Detect if symbol is crypto or stock and return (asset_type, data_script).
    
    Returns:
        (asset_type, data_script_path)
        e.g., ("Cryptocurrencies", "Data-Preparation.py")
             ("Stocks", "Stock-Data-Preparation.py")
    """
    crypto_suffixes = ['USDT', 'BUSD', 'BTC', 'ETH', 'BNB', 'USDC']
    symbol_upper = symbol.upper()
    
    if any(symbol_upper.endswith(suffix) for suffix in crypto_suffixes):
        return "Cryptocurrencies", "Data-Preparation.py"
    else:
        return "Stocks", "Stock-Data-Preparation.py"


class TrainingRequest(BaseModel):
    """Training request schema"""
    symbol: str
    user_id: str
    episodes: int = 1000
    force_retrain: bool = False


class TrainingStatus(BaseModel):
    """Training status response"""
    job_id: str
    status: str
    symbol: str
    user_id: str
    episodes: int
    started_at: str


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "AI Trading GPU Server",
        "status": "online",
        "version": "1.0.0"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint with GPU info"""
    try:
        import torch
        gpu_info = {
            "cuda_available": torch.cuda.is_available(),
            "cuda_version": torch.version.cuda if torch.cuda.is_available() else None,
            "gpu_count": torch.cuda.device_count() if torch.cuda.is_available() else 0,
            "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        }
        
        if torch.cuda.is_available():
            gpu_info["gpu_memory_total"] = f"{torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB"
            gpu_info["gpu_memory_allocated"] = f"{torch.cuda.memory_allocated(0) / 1e9:.2f} GB"
        
        return {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "active_jobs": len(active_jobs),
            "gpu": gpu_info
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "degraded",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }


@app.post("/train", response_model=TrainingStatus)
async def train_model(request: TrainingRequest, background_tasks: BackgroundTasks):
    """
    Trigger GPU training for a financial asset
    
    This endpoint starts a background training job and returns immediately.
    The training results will be uploaded to Supabase Storage upon completion.
    """
    
    # Validate request
    if not request.symbol or not request.user_id:
        raise HTTPException(
            status_code=400,
            detail="symbol and user_id are required"
        )
    
    # Generate job ID
    job_id = f"{request.user_id[:8]}-{request.symbol}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    
    # Check if already training
    if job_id in active_jobs:
        raise HTTPException(
            status_code=409,
            detail=f"Training already in progress for {request.symbol}"
        )
    
    # Register job
    started_at = datetime.utcnow().isoformat()
    active_jobs[job_id] = {
        "status": "running",
        "symbol": request.symbol,
        "user_id": request.user_id,
        "episodes": request.episodes,
        "started_at": started_at
    }
    
    logger.info(f"🚀 Starting training job: {job_id}")
    logger.info(f"   Symbol: {request.symbol}")
    logger.info(f"   User: {request.user_id}")
    logger.info(f"   Episodes: {request.episodes}")
    
    # Start training in background
    background_tasks.add_task(
        run_training,
        job_id,
        request.symbol,
        request.user_id,
        request.episodes,
        request.force_retrain
    )
    
    return TrainingStatus(
        job_id=job_id,
        status="started",
        symbol=request.symbol,
        user_id=request.user_id,
        episodes=request.episodes,
        started_at=started_at
    )


@app.get("/status/{job_id}")
async def get_job_status(job_id: str):
    """Get status of a training job"""
    if job_id not in active_jobs:
        raise HTTPException(
            status_code=404,
            detail=f"Job {job_id} not found"
        )
    
    return active_jobs[job_id]


@app.get("/jobs")
async def list_jobs():
    """List all active training jobs"""
    return {
        "active_jobs": len(active_jobs),
        "jobs": active_jobs
    }


async def run_training(
    job_id: str,
    symbol: str,
    user_id: str,
    episodes: int,
    force_retrain: bool
):
    """
    Execute training pipeline as subprocess.
    
    Pipeline steps:
    1. Detect asset type (Crypto vs Stock)
    2. Fetch market data (Binance for crypto, Interactive Brokers for stocks)
    3. Build features using features_pipeline.py
    4. Train LSTM-PPO model on GPU using train_ppo.py
    5. Upload trained model to Supabase Storage
    6. Update asset_models table in Supabase
    """
    try:
        logger.info(f"🎯 Starting training pipeline for job {job_id}...")
        
        # Detect asset type
        asset_type, data_script = detect_asset_type(symbol)
        logger.info(f"   Detected asset type: {asset_type}")
        logger.info(f"   Using data script: {data_script}")
        logger.info(f"   Output path: PPO_Models/{asset_type}/{symbol}/")
        
        # Update job status
        active_jobs[job_id]["status"] = "fetching_data"
        active_jobs[job_id]["asset_type"] = asset_type
        
        # STEP 1: Fetch market data
        logger.info(f"📊 [1/3] Fetching market data for {symbol}...")
        data_cmd = ["python", data_script, "--symbol", symbol]
        
        data_result = subprocess.run(
            data_cmd,
            capture_output=True,
            text=True,
            timeout=600  # 10 min timeout for data fetching
        )
        
        if data_result.returncode != 0:
            raise RuntimeError(f"Data fetching failed: {data_result.stderr}")
        
        logger.info(f"✅ Data fetched successfully")
        
        # STEP 2: Build features
        logger.info(f"🔧 [2/3] Building features for {symbol}...")
        active_jobs[job_id]["status"] = "building_features"
        
        features_cmd = ["python", "features_pipeline.py", "--symbol", symbol]
        
        features_result = subprocess.run(
            features_cmd,
            capture_output=True,
            text=True,
            timeout=600  # 10 min timeout
        )
        
        if features_result.returncode != 0:
            raise RuntimeError(f"Feature building failed: {features_result.stderr}")
        
        logger.info(f"✅ Features built successfully")
        
        # STEP 3: Train PPO model
        logger.info(f"🤖 [3/3] Training PPO model for {symbol}...")
        active_jobs[job_id]["status"] = "training"
        
        train_cmd = [
            "python",
            "train_ppo.py",
            "--symbol", symbol,
            "--asset_type", asset_type,
            "--steps", "4096",
            "--updates", str(episodes)  # Use episodes as update count
        ]
        
        train_result = subprocess.run(
            train_cmd,
            capture_output=True,
            text=True,
            timeout=3600  # 1 hour timeout for training
        )
        
        # Check training result
        if train_result.returncode == 0:
            logger.info(f"✅ Full training pipeline completed successfully for {symbol}")
            active_jobs[job_id]["status"] = "completed"
            active_jobs[job_id]["completed_at"] = datetime.utcnow().isoformat()
            
            # Save model path info
            model_path = f"PPO_Models/{asset_type}/{symbol}/models/final_model.pt"
            active_jobs[job_id]["model_path"] = model_path
            
            # Try to parse performance metrics from output
            try:
                # Look for JSON metrics in stdout
                for line in train_result.stdout.split('\n'):
                    if line.startswith('{') and 'win_rate' in line:
                        metrics = json.loads(line)
                        active_jobs[job_id]["metrics"] = metrics
                        break
            except Exception as e:
                logger.warning(f"Could not parse metrics: {e}")
            
        else:
            logger.error(f"❌ Training pipeline failed for {symbol}")
            logger.error(f"   Error: {train_result.stderr}")
            active_jobs[job_id]["status"] = "failed"
            active_jobs[job_id]["error"] = train_result.stderr[-500:]  # Last 500 chars
            active_jobs[job_id]["failed_at"] = datetime.utcnow().isoformat()
        
        # Log all outputs
        logger.info(f"Data output:\n{data_result.stdout}")
        logger.info(f"Features output:\n{features_result.stdout}")
        logger.info(f"Training output:\n{train_result.stdout}")
        
        if train_result.stderr:
            logger.warning(f"Training stderr:\n{train_result.stderr}")
            
    except subprocess.TimeoutExpired:
        logger.error(f"⏱️ Training timeout for {symbol} (exceeded 1 hour)")
        active_jobs[job_id]["status"] = "timeout"
        active_jobs[job_id]["failed_at"] = datetime.utcnow().isoformat()
        
    except Exception as e:
        logger.error(f"❌ Training error for {symbol}: {str(e)}")
        active_jobs[job_id]["status"] = "error"
        active_jobs[job_id]["error"] = str(e)
        active_jobs[job_id]["failed_at"] = datetime.utcnow().isoformat()


if __name__ == "__main__":
    import uvicorn
    
    host = os.getenv("SERVER_HOST", "0.0.0.0")
    port = int(os.getenv("SERVER_PORT", 8000))
    workers = int(os.getenv("WORKERS", 1))
    
    logger.info("=" * 60)
    logger.info("🚀 Starting AI Trading GPU Server")
    logger.info(f"   Host: {host}")
    logger.info(f"   Port: {port}")
    logger.info(f"   Workers: {workers}")
    logger.info("=" * 60)
    
    # Check GPU availability
    try:
        import torch
        if torch.cuda.is_available():
            logger.info(f"✅ GPU detected: {torch.cuda.get_device_name(0)}")
            logger.info(f"   CUDA version: {torch.version.cuda}")
            logger.info(f"   GPU memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")
        else:
            logger.warning("⚠️ No GPU detected - training will be slow!")
    except ImportError:
        logger.error("❌ PyTorch not installed!")
    
    # Start server
    uvicorn.run(
        app,
        host=host,
        port=port,
        workers=workers,
        log_level="info"
    )
