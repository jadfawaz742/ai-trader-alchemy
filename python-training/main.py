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
    Execute training script as subprocess
    
    This runs train_ppo.py which will:
    1. Fetch market data from Binance/Yahoo Finance
    2. Extract 31 features using features_pipeline.py
    3. Train LSTM-PPO model on GPU
    4. Upload trained model to Supabase Storage
    5. Update asset_models table in Supabase
    """
    try:
        logger.info(f"🎯 Executing training script for job {job_id}...")
        
        # Build command
        cmd = [
            "python",
            "train_ppo.py",
            "--symbol", symbol,
            "--user_id", user_id,
            "--episodes", str(episodes)
        ]
        
        if force_retrain:
            cmd.append("--force_retrain")
        
        # Update job status
        active_jobs[job_id]["status"] = "training"
        
        # Execute training
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=3600  # 1 hour timeout
        )
        
        # Check result
        if result.returncode == 0:
            logger.info(f"✅ Training completed successfully for {symbol}")
            active_jobs[job_id]["status"] = "completed"
            active_jobs[job_id]["completed_at"] = datetime.utcnow().isoformat()
            
            # Try to parse performance metrics from output
            try:
                # Look for JSON metrics in stdout
                for line in result.stdout.split('\n'):
                    if line.startswith('{') and 'win_rate' in line:
                        metrics = json.loads(line)
                        active_jobs[job_id]["metrics"] = metrics
                        break
            except Exception as e:
                logger.warning(f"Could not parse metrics: {e}")
            
        else:
            logger.error(f"❌ Training failed for {symbol}")
            logger.error(f"   Error: {result.stderr}")
            active_jobs[job_id]["status"] = "failed"
            active_jobs[job_id]["error"] = result.stderr[-500:]  # Last 500 chars
            active_jobs[job_id]["failed_at"] = datetime.utcnow().isoformat()
        
        # Log output
        logger.info(f"Training output:\n{result.stdout}")
        if result.stderr:
            logger.warning(f"Training stderr:\n{result.stderr}")
            
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
