# Deployment Guide: GPU Training Server on Vultr

This guide walks you through deploying the Python GPU training system to a Vultr GPU instance.

## 🎯 Overview

You'll set up:
1. Vultr GPU Cloud Instance
2. CUDA + PyTorch environment
3. FastAPI training server
4. Connection to Supabase backend

## 📋 Prerequisites

- Vultr account with GPU access
- Supabase service role key
- Binance API credentials (for data)
- SSH client

---

## Step 1: Create Vultr GPU Instance

### Recommended Specs
- **GPU**: NVIDIA A10/A40 or RTX 6000 Ada
- **vCPU**: 8+ cores
- **RAM**: 32GB+
- **Storage**: 100GB NVMe SSD
- **OS**: Ubuntu 22.04 LTS

### Setup via Vultr Dashboard
1. Login to [Vultr](https://my.vultr.com/)
2. Navigate to **Compute** → **Deploy New Server**
3. Select **Cloud GPU**
4. Choose location (nearest to your users)
5. Select **Ubuntu 22.04**
6. Choose GPU plan (RTX A4000 or better)
7. Add SSH key
8. Deploy

### Cost Estimate
- RTX A4000: ~$1.50/hour
- A10 GPU: ~$2.00/hour
- Monthly: ~$1,000-1,500 for 24/7 operation

**Optimization**: Use on-demand scaling and shut down during low-traffic hours.

---

## Step 2: Initial Server Setup

### SSH into Server
```bash
ssh root@<your-vultr-ip>
```

### Update System
```bash
apt update && apt upgrade -y
apt install -y build-essential git wget curl vim htop
```

### Create Non-Root User (Recommended)
```bash
adduser aitrader
usermod -aG sudo aitrader
su - aitrader
```

---

## Step 3: Install CUDA and Drivers

### Install NVIDIA Drivers
```bash
sudo apt install -y nvidia-driver-535
sudo reboot  # Reboot to load drivers
```

### Verify GPU
```bash
nvidia-smi
# Should show GPU model and CUDA version
```

### Install CUDA Toolkit (11.8)
```bash
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.0-1_all.deb
sudo dpkg -i cuda-keyring_1.0-1_all.deb
sudo apt update
sudo apt install -y cuda-11-8

# Add to PATH
echo 'export PATH=/usr/local/cuda-11.8/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=/usr/local/cuda-11.8/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc
source ~/.bashrc
```

### Verify CUDA
```bash
nvcc --version
```

---

## Step 4: Install Python Environment

### Install Python 3.10+
```bash
sudo apt install -y python3.10 python3.10-venv python3-pip
python3 --version  # Should be 3.10+
```

### Create Virtual Environment
```bash
mkdir ~/trading-gpu
cd ~/trading-gpu
python3 -m venv venv
source venv/bin/activate
```

### Upgrade pip
```bash
pip install --upgrade pip setuptools wheel
```

---

## Step 5: Install PyTorch with CUDA

### Install PyTorch (CUDA 11.8)
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

### Verify PyTorch GPU
```bash
python3 << EOF
import torch
print(f"PyTorch version: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
print(f"CUDA version: {torch.version.cuda}")
print(f"GPU: {torch.cuda.get_device_name(0)}")
EOF
```

Expected output:
```
PyTorch version: 2.1.0+cu118
CUDA available: True
CUDA version: 11.8
GPU: NVIDIA RTX A4000
```

---

## Step 6: Deploy Training Code

### Option A: Git Clone from Lovable Project

If you've pushed your Lovable project to GitHub:
```bash
cd ~/trading-gpu
git clone https://github.com/yourusername/your-repo.git
cd your-repo/python-training
```

### Option B: Manual Upload via SCP

From your local machine:
```bash
scp -r ./python-training root@<vultr-ip>:/home/aitrader/trading-gpu/
```

### Install Dependencies
```bash
cd ~/trading-gpu/python-training
source ../venv/bin/activate
pip install -r requirements.txt
```

### Special: Install TA-Lib (if needed)
```bash
# Install TA-Lib C library
wget http://prdownloads.sourceforge.net/ta-lib/ta-lib-0.4.0-src.tar.gz
tar -xzf ta-lib-0.4.0-src.tar.gz
cd ta-lib/
./configure --prefix=/usr
make
sudo make install
cd ..

# Install Python wrapper
pip install ta-lib
```

---

## Step 7: Configure Environment

### Create .env File
```bash
cd ~/trading-gpu/python-training
nano .env
```

Add:
```env
# Supabase Configuration
SUPABASE_URL=https://ncetkhcryoxchkodlzgj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Binance API (for market data)
BINANCE_API_KEY=your_binance_key
BINANCE_API_SECRET=your_binance_secret

# GPU Configuration
CUDA_VISIBLE_DEVICES=0
PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:128

# Server Configuration
SERVER_HOST=0.0.0.0
SERVER_PORT=8000
WORKERS=1

# Logging
LOG_LEVEL=INFO
```

Save with `Ctrl+X`, `Y`, `Enter`.

### Secure .env File
```bash
chmod 600 .env
```

---

## Step 8: Create FastAPI Server

### Create main.py
```bash
nano main.py
```

Add:
```python
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
import os
from dotenv import load_dotenv
import subprocess
import json

load_dotenv()

app = FastAPI(title="AI Trading GPU Server")

class TrainingRequest(BaseModel):
    symbol: str
    user_id: str
    episodes: int = 1000
    force_retrain: bool = False

@app.get("/health")
async def health_check():
    import torch
    return {
        "status": "healthy",
        "cuda_available": torch.cuda.is_available(),
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None
    }

@app.post("/train")
async def train_model(request: TrainingRequest, background_tasks: BackgroundTasks):
    """Trigger training job in background"""
    
    # Validate request
    if not request.symbol or not request.user_id:
        raise HTTPException(status_code=400, detail="symbol and user_id required")
    
    # Start training in background
    background_tasks.add_task(
        run_training,
        request.symbol,
        request.user_id,
        request.episodes,
        request.force_retrain
    )
    
    return {
        "status": "training_started",
        "symbol": request.symbol,
        "user_id": request.user_id,
        "episodes": request.episodes
    }

async def run_training(symbol: str, user_id: str, episodes: int, force_retrain: bool):
    """Execute training script"""
    try:
        cmd = [
            "python", "train_ppo.py",
            "--symbol", symbol,
            "--user_id", user_id,
            "--episodes", str(episodes)
        ]
        
        if force_retrain:
            cmd.append("--force_retrain")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=3600  # 1 hour timeout
        )
        
        if result.returncode == 0:
            print(f"✅ Training completed for {symbol}")
        else:
            print(f"❌ Training failed: {result.stderr}")
            
    except Exception as e:
        print(f"❌ Training error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=os.getenv("SERVER_HOST", "0.0.0.0"),
        port=int(os.getenv("SERVER_PORT", 8000)),
        workers=1
    )
```

---

## Step 9: Test Training System

### Run Standalone Training
```bash
cd ~/trading-gpu/python-training
source ../venv/bin/activate
python train_ppo.py --symbol BTCUSDT --user_id test-uuid --episodes 100
```

Expected output:
```
🚀 Starting PPO training for BTCUSDT
📥 Fetching market data...
✅ Loaded 500 candles
🔧 Extracting 31 features...
✅ Features ready: (500, 31)
🤖 Initializing LSTM-PPO model...
✅ Model loaded on cuda:0
🎯 Training for 100 episodes...
Episode 10/100 | Reward: 0.23 | Loss: 0.05
Episode 50/100 | Reward: 0.58 | Loss: 0.02
Episode 100/100 | Reward: 0.82 | Loss: 0.01
✅ Training complete | Win Rate: 63% | Sharpe: 1.9
📤 Uploading to Supabase...
✅ Model saved: trained-models/test-uuid/BTCUSDT/v1.json
```

---

## Step 10: Run FastAPI Server

### Test Server Locally
```bash
python main.py
```

Visit: `http://localhost:8000/docs` for API documentation.

### Run as Systemd Service (Production)

Create service file:
```bash
sudo nano /etc/systemd/system/trading-gpu.service
```

Add:
```ini
[Unit]
Description=AI Trading GPU Server
After=network.target

[Service]
Type=simple
User=aitrader
WorkingDirectory=/home/aitrader/trading-gpu/python-training
Environment="PATH=/home/aitrader/trading-gpu/venv/bin"
ExecStart=/home/aitrader/trading-gpu/venv/bin/python main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable trading-gpu
sudo systemctl start trading-gpu
sudo systemctl status trading-gpu
```

View logs:
```bash
sudo journalctl -u trading-gpu -f
```

---

## Step 11: Configure Firewall

### Open Port 8000
```bash
sudo ufw allow 8000/tcp
sudo ufw enable
```

### Test External Access
From your local machine:
```bash
curl http://<vultr-ip>:8000/health
```

Expected:
```json
{
  "status": "healthy",
  "cuda_available": true,
  "gpu_name": "NVIDIA RTX A4000"
}
```

---

## Step 12: Update Supabase Edge Function

Now update your `train-asset-model/index.ts` to call the GPU server:

```typescript
const GPU_SERVER_URL = Deno.env.get('GPU_SERVER_URL') || 'http://<vultr-ip>:8000';

// Try GPU training first
try {
  const gpuResponse = await fetch(`${GPU_SERVER_URL}/train`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbol: normalizedSymbol,
      user_id: userId,
      episodes: 1000,
      force_retrain: forceRetrain
    })
  });
  
  if (gpuResponse.ok) {
    return new Response(
      JSON.stringify({ message: 'GPU training started', symbol: normalizedSymbol }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
} catch (error) {
  console.log('⚠️ GPU server unavailable, falling back to TypeScript training');
}

// Fallback to TypeScript training...
```

Add GPU_SERVER_URL secret in Supabase:
```bash
# In Lovable project
GPU_SERVER_URL=http://<vultr-ip>:8000
```

---

## Step 13: Monitoring and Maintenance

### Monitor GPU Usage
```bash
watch -n 1 nvidia-smi
```

### Monitor Server Logs
```bash
sudo journalctl -u trading-gpu -f
```

### Monitor Python Processes
```bash
htop
# Press F4 and type "python" to filter
```

### Auto-Restart on Crash
The systemd service automatically restarts on failure.

### Disk Space Management
```bash
# Clean old checkpoints
cd ~/trading-gpu/python-training/checkpoints
find . -name "*.pth" -mtime +7 -delete  # Delete 7+ day old checkpoints
```

---

## 🔒 Security Checklist

- [ ] Use SSH keys (disable password auth)
- [ ] Configure UFW firewall (only allow 22, 8000)
- [ ] Store secrets in .env (never commit)
- [ ] Use HTTPS for production (add Nginx + Let's Encrypt)
- [ ] Implement API authentication (JWT tokens)
- [ ] Enable rate limiting on FastAPI
- [ ] Set up log rotation
- [ ] Regular security updates: `apt update && apt upgrade`

---

## 📊 Performance Tuning

### Optimize GPU Memory
```bash
# Add to .env
PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:128
```

### Concurrent Training Jobs
```python
# In main.py, increase workers for parallel training
WORKERS=4  # Train 4 assets simultaneously
```

### Data Caching
```python
# Cache market data in Redis
pip install redis
# Configure in Data-Preparation.py
```

---

## 🐛 Troubleshooting

### Issue: CUDA Out of Memory
**Solution**: Reduce batch size in train_ppo.py
```python
batch_size = 32  # Instead of 64
```

### Issue: Training Timeout
**Solution**: Increase timeout in main.py
```python
timeout=7200  # 2 hours instead of 1
```

### Issue: Supabase Upload Fails
**Solution**: Check service role key permissions
```bash
# Test connection
python -c "from supabase import create_client; client = create_client('url', 'key'); print(client.table('asset_models').select('*').limit(1).execute())"
```

---

## 📈 Scaling Strategies

### Horizontal Scaling
Deploy multiple GPU servers:
- Server 1: Crypto pairs (BTC, ETH, BNB)
- Server 2: Forex pairs (EUR, GBP, JPY)
- Server 3: Batch retraining

### Load Balancing
Use Nginx to distribute requests:
```nginx
upstream gpu_servers {
    server 10.0.0.1:8000;
    server 10.0.0.2:8000;
    server 10.0.0.3:8000;
}
```

### Auto-Scaling
Use Vultr API to spawn instances on-demand:
```python
# Scale up during high training load
# Scale down during idle periods
```

---

## 💰 Cost Optimization

1. **Spot Instances**: Use Vultr Reserved Instances (save 30-50%)
2. **Scheduled Shutdown**: Auto-stop during low-traffic (2am-6am)
3. **Batch Training**: Group multiple assets per training run
4. **Model Caching**: Reuse feature extraction across symbols

**Example Savings**:
- 24/7 operation: $1,500/month
- 12/7 operation (with shutdown): $750/month
- Reserved instance: $525/month

---

## 🎉 Success Checklist

- [ ] GPU server running and accessible
- [ ] CUDA/PyTorch working
- [ ] Training script completes successfully
- [ ] FastAPI server responding to /health
- [ ] Supabase integration working
- [ ] Edge function calling GPU server
- [ ] Models uploading to Supabase Storage
- [ ] Monitoring set up (logs, GPU usage)
- [ ] Security hardened
- [ ] Backups configured

---

**Next Steps**: 
1. Test end-to-end flow (edge function → GPU → Supabase)
2. Implement A/B testing for model comparison
3. Set up alerts for training failures
4. Create dashboard for training metrics

**Support**: Check logs in `/var/log/trading-gpu/` or Supabase edge function logs.

---

**Last Updated**: 2025-01-20  
**Version**: 1.0.0
