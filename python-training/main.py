#!/usr/bin/env python3
"""
FastAPI GPU Training Server
Receives training requests from Lovable/Supabase and executes PPO training on GPU.
- Uses 2x V100 via simple "fill-first-GPU" scheduling (cuda:0, then cuda:1)
- Blocks duplicate jobs for the same symbol while one is running
- Cleans up GPU memory after each run
"""

from fastapi import FastAPI, BackgroundTasks, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import subprocess
import json
import logging
from dotenv import load_dotenv
from datetime import datetime
from typing import Optional, Dict, Any

# ------------------------------------------------------------
# Load env + Configure logging FIRST
# ------------------------------------------------------------
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Check for GPU_API_KEY
GPU_API_KEY = os.getenv("GPU_API_KEY")
if not GPU_API_KEY:
    logger.warning("⚠️ GPU_API_KEY not set - API authentication disabled!")

# ------------------------------------------------------------
# FastAPI app
# ------------------------------------------------------------
app = FastAPI(
    title="GPU PPO Training Server",
    description="Dual-V100 GPU scheduler for PPO training",
    version="2.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ALLOW_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Track active training jobs
active_jobs: Dict[str, Dict[str, Any]] = {}

# Track GPU job counts (fill-first scheduling)
gpu_jobs: Dict[str, int] = {"cuda:0": 0, "cuda:1": 0}


def select_available_gpu() -> Optional[str]:
    """
    Fill-first GPU scheduler:
      - If cuda:0 is free (0 jobs) → pick cuda:0
      - Else if cuda:1 is free (0 jobs) → pick cuda:1
      - Else return None (both busy, caller returns 429 error)
    If CUDA unavailable, returns "cpu".
    """
    try:
        import torch
        if not torch.cuda.is_available():
            return "cpu"
        
        # Fill-first policy: use cuda:0 first, then cuda:1
        if gpu_jobs.get("cuda:0", 0) == 0:
            return "cuda:0"
        if gpu_jobs.get("cuda:1", 0) == 0:
            return "cuda:1"
        return None  # Both GPUs busy
    except Exception as e:
        logger.warning(f"GPU detection failed, falling back to CPU: {e}")
        return "cpu"


def symbol_currently_running(symbol: str) -> bool:
    """Return True if any active job is training this symbol."""
    for job in active_jobs.values():
        if (
            job.get("symbol") == symbol
            and job.get("status") in {"running", "fetching_data", "building_features", "training"}
        ):
            return True
    return False


# ------------------------------------------------------------
# API endpoints
# ------------------------------------------------------------
@app.get("/")
async def root():
    return {"message": "GPU PPO Training Server v2.0 - Dual V100 Ready"}


@app.get("/health")
async def health_check():
    """Health check endpoint with GPU info & scheduler counters."""
    gpu_info = {}
    try:
        import torch
        gpu_info = {
            "cuda_available": torch.cuda.is_available(),
            "cuda_version": torch.version.cuda if torch.cuda.is_available() else None,
            "gpu_count": torch.cuda.device_count() if torch.cuda.is_available() else 0,
            "gpus": [],
        }
        if torch.cuda.is_available():
            for i in range(torch.cuda.device_count()):
                name = torch.cuda.get_device_name(i)
                props = torch.cuda.get_device_properties(i)
                gpu_info["gpus"].append({
                    "index": i,
                    "name": name,
                    "total_memory_gb": round(props.total_memory / 1e9, 2),
                    "jobs": gpu_jobs.get(f"cuda:{i}", 0),
                })
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        gpu_info = {"error": str(e)}

    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "active_jobs": len(active_jobs),
        "gpu": gpu_info,
        "gpu_jobs": gpu_jobs,
    }


# ------------------------------------------------------------
# Training request models
# ------------------------------------------------------------
class TrainingRequest(BaseModel):
    symbol: str
    user_id: str
    episodes: int = 2000
    force_retrain: bool = False


class TrainingStatus(BaseModel):
    job_id: str
    status: str
    symbol: str
    user_id: str
    episodes: int
    started_at: str
    completed_at: Optional[str] = None
    failed_at: Optional[str] = None
    error: Optional[str] = None
    device: Optional[str] = None


@app.post("/train")
async def train_model(
    request: TrainingRequest,
    background_tasks: BackgroundTasks,
    x_api_key: Optional[str] = Header(None)
):
    """
    Endpoint to start a training job on available GPU.
    Returns 429 if both GPUs are busy.
    Returns 409 if symbol already training.
    """
    # Auth check
    if GPU_API_KEY and x_api_key != GPU_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    # Validate request
    if not request.symbol or not request.user_id:
        raise HTTPException(
            status_code=400,
            detail="symbol and user_id are required"
        )

    # Validate episodes
    if request.episodes <= 0:
        raise HTTPException(
            status_code=400,
            detail="episodes must be a positive integer"
        )

    # --- Duplicate-job protection
    if symbol_currently_running(request.symbol):
        raise HTTPException(
            status_code=409,
            detail=f"Training already running for symbol {request.symbol}"
        )

    # --- Select device via fill-first scheduling
    device = select_available_gpu()
    if device is None:
        # Both GPUs are busy
        raise HTTPException(
            status_code=429,
            detail="All GPUs busy. Try again later."
        )

    # Generate job ID
    job_id = f"{request.user_id[:8]}-{request.symbol}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"

    # Register job
    started_at = datetime.utcnow().isoformat()
    active_jobs[job_id] = {
        "status": "running",
        "symbol": request.symbol,
        "user_id": request.user_id,
        "episodes": request.episodes,
        "started_at": started_at,
        "device": device,
    }

    # Increment GPU counter
    if device.startswith("cuda:"):
        gpu_jobs[device] = gpu_jobs.get(device, 0) + 1

    logger.info(f"🚀 Starting training job: {job_id}")
    logger.info(f"   Symbol:   {request.symbol}")
    logger.info(f"   User:     {request.user_id}")
    logger.info(f"   Episodes: {request.episodes}")
    logger.info(f"   Device:   {device}")

    # Start training in background
    background_tasks.add_task(
        run_training,
        job_id,
        request.symbol,
        request.user_id,
        request.episodes,
        request.force_retrain,
        device
    )

    return {
        "job_id": job_id,
        "status": "started",
        "message": f"Training job started on {device}",
        "device": device,
    }


@app.get("/status/{job_id}")
async def get_job_status(job_id: str):
    """Get status of a specific training job."""
    if job_id not in active_jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return active_jobs[job_id]


@app.get("/jobs")
async def list_jobs():
    """List all active training jobs."""
    return {
        "jobs": active_jobs,
        "count": len(active_jobs),
        "gpu_jobs": gpu_jobs,
    }


# ------------------------------------------------------------
# Training pipeline execution
# ------------------------------------------------------------
async def run_training(
    job_id: str,
    symbol: str,
    user_id: str,
    episodes: int,
    force_retrain: bool,
    device: str
):
    """
    Background task that runs the entire training pipeline.
    """
    try:
        # Detect asset type
        active_jobs[job_id]["status"] = "detecting_asset_type"
        asset_type = detect_asset_type(symbol)
        logger.info(f"[{job_id}] Detected asset type: {asset_type}")

        # Step 1: Fetch market data
        active_jobs[job_id]["status"] = "fetching_data"
        logger.info(f"[{job_id}] Fetching market data for {symbol}...")

        data_cmd = [
            "python",
            "Stock-Data-Preparation.py" if asset_type == "Stocks" else "Data-Preparation.py",
            symbol
        ]

        result = subprocess.run(
            data_cmd,
            capture_output=True,
            text=True,
            timeout=300,
            cwd=os.path.dirname(os.path.abspath(__file__))
        )

        if result.returncode != 0:
            raise RuntimeError(f"Data fetch failed: {result.stderr}")

        logger.info(f"[{job_id}] ✅ Market data fetched")

        # Step 2: Build features
        active_jobs[job_id]["status"] = "building_features"
        logger.info(f"[{job_id}] Building features for {symbol}...")

        features_cmd = [
            "python",
            "features_pipeline.py",
            symbol,
            asset_type
        ]

        result = subprocess.run(
            features_cmd,
            capture_output=True,
            text=True,
            timeout=600,
            cwd=os.path.dirname(os.path.abspath(__file__))
        )

        if result.returncode != 0:
            raise RuntimeError(f"Feature building failed: {result.stderr}")

        logger.info(f"[{job_id}] ✅ Features built")

        # Step 3: Train PPO model
        active_jobs[job_id]["status"] = "training"
        logger.info(f"[{job_id}] Training PPO model for {symbol} on {device}...")

        train_cmd = [
            "python",
            "train_ppo.py",
            "--symbol", symbol,
            "--asset_type", asset_type,
            "--steps", "4096",
            "--updates", str(episodes),
            "--device", device
        ]
        
        # Set environment variable for user_id (for Supabase upload)
        env = os.environ.copy()
        env["TRAINING_USER_ID"] = user_id

        result = subprocess.run(
            train_cmd,
            capture_output=True,
            text=True,
            timeout=7200,
            cwd=os.path.dirname(os.path.abspath(__file__)),
            env=env  # Pass environment with TRAINING_USER_ID
        )

        if result.returncode != 0:
            raise RuntimeError(f"Training failed: {result.stderr}")

        logger.info(f"[{job_id}] ✅ Training completed")
        logger.info(f"[{job_id}] Training output:\n{result.stdout}")

        # Mark as complete
        active_jobs[job_id]["status"] = "completed"
        active_jobs[job_id]["completed_at"] = datetime.utcnow().isoformat()

        # Try to parse metrics from output
        try:
            metrics = parse_training_metrics(result.stdout)
            active_jobs[job_id]["metrics"] = metrics
        except Exception as e:
            logger.warning(f"Could not parse metrics: {e}")

    except subprocess.TimeoutExpired:
        logger.error(f"[{job_id}] ❌ Training timed out")
        active_jobs[job_id]["status"] = "timeout"
        active_jobs[job_id]["error"] = "Training exceeded time limit"
        active_jobs[job_id]["failed_at"] = datetime.utcnow().isoformat()

    except Exception as e:
        logger.error(f"❌ Training error for {symbol}: {str(e)}")
        active_jobs[job_id]["status"] = "error"
        active_jobs[job_id]["error"] = str(e)
        active_jobs[job_id]["failed_at"] = datetime.utcnow().isoformat()
    
    finally:
        # Decrement GPU slot if used
        try:
            dev = active_jobs.get(job_id, {}).get("device")
            if dev and dev.startswith("cuda:") and dev in gpu_jobs:
                gpu_jobs[dev] = max(0, gpu_jobs[dev] - 1)
        except Exception:
            pass
        
        # Cleanup GPU memory
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.synchronize()
                logger.info("🧹 GPU memory cleaned")
        except Exception as e:
            logger.warning(f"GPU cleanup failed: {e}")


def detect_asset_type(symbol: str) -> str:
    """
    Detect if symbol is a crypto or stock.
    """
    crypto_suffixes = ['USDT', 'BUSD', 'BTC', 'ETH', 'BNB', 'USDC']
    s = symbol.upper()
    if any(s.endswith(suffix) for suffix in crypto_suffixes):
        return "Cryptocurrencies"
    return "Stocks"


def parse_training_metrics(output: str) -> dict:
    """
    Try to extract training metrics from stdout.
    """
    metrics = {}
    for line in output.split('\n'):
        if 'final_return' in line.lower():
            try:
                metrics['final_return'] = float(line.split(':')[-1].strip())
            except:
                pass
        if 'avg_reward' in line.lower():
            try:
                metrics['avg_reward'] = float(line.split(':')[-1].strip())
            except:
                pass
    return metrics


# ------------------------------------------------------------
# Server startup
# ------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    # Check for GPU
    try:
        import torch
        if torch.cuda.is_available():
            gpu_count = torch.cuda.device_count()
            logger.info(f"✅ GPU(s) detected: {gpu_count}")
            for i in range(gpu_count):
                gpu_name = torch.cuda.get_device_name(i)
                logger.info(f"   - cuda:{i} -> {gpu_name}")
        else:
            logger.warning("⚠️ No GPU detected - training will run on CPU (slow!)")
    except ImportError:
        logger.warning("⚠️ PyTorch not installed - cannot detect GPU")

    # Server config
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    workers = int(os.getenv("WORKERS", "1"))

    logger.info(f"🚀 Starting GPU Training Server on {host}:{port}")
    logger.info(f"   Workers: {workers}")
    logger.info(f"   API Key Auth: {'Enabled' if GPU_API_KEY else 'Disabled'}")

    # Optional HTTPS
    ssl_keyfile = os.getenv("SSL_KEYFILE")
    ssl_certfile = os.getenv("SSL_CERTFILE")
    enable_https = os.getenv("ENABLE_HTTPS", "false").lower() == "true"

    if enable_https and ssl_keyfile and ssl_certfile:
        logger.info(f"🔒 HTTPS enabled")
        uvicorn.run(
            app,
            host=host,
            port=port,
            workers=workers,
            ssl_keyfile=ssl_keyfile,
            ssl_certfile=ssl_certfile
        )
    else:
        uvicorn.run(app, host=host, port=port, workers=workers)
