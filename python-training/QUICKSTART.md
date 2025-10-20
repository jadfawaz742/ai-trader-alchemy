# Quick Start Guide

Get your GPU training server running in 5 minutes!

## 🚀 Local Development (No GPU Required for Testing)

### 1. Install Dependencies
```bash
cd python-training
pip install -r requirements.txt
```

### 2. Configure Environment
```bash
cp .env.example .env
nano .env  # Add your credentials
```

Required variables:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key from Supabase
- `BINANCE_API_KEY` - Binance API key (for market data)
- `BINANCE_API_SECRET` - Binance API secret

### 3. Test Training Script
```bash
python train_ppo.py --symbol BTCUSDT --user_id test-uuid --episodes 10
```

Expected output:
```
🚀 Starting PPO training for BTCUSDT
📥 Fetching market data...
✅ Loaded 500 candles
🔧 Extracting 31 features...
✅ Training complete | Win Rate: 61% | Sharpe: 1.7
```

### 4. Start FastAPI Server
```bash
python main.py
```

Visit: http://localhost:8000/docs for API documentation

### 5. Test API Endpoint
```bash
curl -X POST http://localhost:8000/train \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTCUSDT",
    "user_id": "test-uuid",
    "episodes": 100
  }'
```

---

## 🐳 Docker Deployment (Recommended for Production)

### 1. Build Docker Image
```bash
cd python-training
docker build -t ai-trading-gpu .
```

### 2. Run with Docker Compose
```bash
# Configure .env first
docker-compose up -d
```

### 3. Check Logs
```bash
docker-compose logs -f
```

### 4. Test Health Endpoint
```bash
curl http://localhost:8000/health
```

---

## ☁️ Vultr GPU Deployment (Production)

### 1. Create Vultr GPU Instance
- Go to [Vultr Dashboard](https://my.vultr.com/)
- Deploy New Server → Cloud GPU
- Select Ubuntu 22.04 + NVIDIA GPU (RTX A4000 or better)
- Add SSH key

### 2. SSH into Server
```bash
ssh root@<vultr-ip>
```

### 3. Install Docker & NVIDIA Container Toolkit
```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

### 4. Clone Your Repository
```bash
git clone <your-repo-url>
cd <repo-name>/python-training
```

### 5. Configure Environment
```bash
nano .env
# Add all your credentials
```

### 6. Deploy with Docker
```bash
docker-compose up -d
```

### 7. Verify GPU Access
```bash
docker exec ai-trading-gpu python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}')"
```

Should output: `CUDA: True`

### 8. Configure Firewall
```bash
sudo ufw allow 8000/tcp
sudo ufw enable
```

### 9. Test External Access
From your local machine:
```bash
curl http://<vultr-ip>:8000/health
```

---

## 🔗 Connect to Supabase Edge Function

### 1. Add GPU Server URL as Secret
In your Lovable project or Supabase dashboard, add:
```
GPU_SERVER_URL=http://<vultr-ip>:8000
```

### 2. Edge Function Will Auto-Detect
Your `train-asset-model` edge function will now:
1. Try GPU training first
2. Fallback to TypeScript if GPU unavailable

### 3. Test End-to-End
In your app, trigger training for any symbol:
```typescript
await supabase.functions.invoke('train-asset-model', {
  body: { symbol: 'BTCUSDT', episodes: 1000 }
})
```

Check logs:
```bash
# GPU Server
docker-compose logs -f

# Supabase Edge Function
# Check in Supabase dashboard → Edge Functions → Logs
```

---

## 📊 Monitor Training

### Check Active Jobs
```bash
curl http://<server-ip>:8000/jobs
```

### Check Specific Job
```bash
curl http://<server-ip>:8000/status/<job-id>
```

### View GPU Usage
```bash
docker exec ai-trading-gpu nvidia-smi
```

---

## 🐛 Troubleshooting

### Issue: "CUDA not available"
**Solution**:
```bash
# Verify NVIDIA drivers
nvidia-smi

# Reinstall NVIDIA Container Toolkit
sudo apt-get install --reinstall nvidia-container-toolkit
sudo systemctl restart docker
```

### Issue: "Training timeout"
**Solution**: Reduce episodes or increase timeout in `main.py`:
```python
timeout=7200  # 2 hours
```

### Issue: "Out of memory"
**Solution**: Reduce batch size in training config:
```python
batch_size = 32  # Instead of 64
```

### Issue: "Cannot fetch market data"
**Solution**: Check Binance API credentials:
```bash
# Test manually
python -c "from binance import Client; c = Client('<key>', '<secret>'); print(c.get_symbol_ticker(symbol='BTCUSDT'))"
```

---

## 📈 Performance Expectations

### Training Speed (RTX A4000)
- 100 episodes: 2-3 minutes
- 1000 episodes: 15-20 minutes
- 5000 episodes: 60-90 minutes

### Model Quality Targets
- Win rate: 60-65%
- Sharpe ratio: 1.5-2.5
- Max drawdown: <15%

---

## 🔒 Security Checklist

- [ ] `.env` file is in `.gitignore`
- [ ] Supabase service role key is secure
- [ ] Firewall only allows ports 22, 8000
- [ ] SSH key authentication enabled
- [ ] Regular security updates: `apt update && apt upgrade`

---

## 🎉 Success Checklist

- [ ] Training script runs successfully
- [ ] FastAPI server responds to `/health`
- [ ] GPU is detected (check `/health` endpoint)
- [ ] Edge function connects to GPU server
- [ ] Models upload to Supabase Storage
- [ ] `asset_models` table updates correctly

---

## 📚 Next Steps

1. **Implement batch online learning** - Update models with live trade data
2. **Add A/B testing** - Compare shadow vs active models
3. **Set up monitoring** - Track training metrics and GPU usage
4. **Configure auto-scaling** - Spawn GPU instances on demand
5. **Optimize costs** - Schedule shutdown during idle hours

---

**Need help?** Check the full documentation in:
- `README.md` - Complete system overview
- `DEPLOYMENT.md` - Detailed deployment guide
- Supabase edge function logs - For integration issues

**Last Updated**: 2025-01-20
