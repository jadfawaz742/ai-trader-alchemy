# GPU-Based PPO Training System

This directory contains the Python-based GPU training system for your AI trading models. This code is designed to run on a Vultr GPU server (or any CUDA-enabled machine) and integrates with your Supabase backend.

## 🏗️ Architecture Overview

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Supabase      │         │   Vultr GPU      │         │   Supabase      │
│   Edge Function │────────>│   Training       │────────>│   Storage       │
│   (TypeScript)  │ Trigger │   Server         │ Upload  │   (Models)      │
└─────────────────┘         │   (Python/PyTorch)│        └─────────────────┘
                            └──────────────────┘
                                     │
                                     │ Fetch Data
                                     v
                            ┌──────────────────┐
                            │   Market Data    │
                            │   (Binance/YF)   │
                            └──────────────────┘
```

## 📁 File Structure

### Core Training Files
- **`train_ppo.py`** - Main PPO training orchestrator
  - Loads data, initializes model, runs training loop
  - Handles model checkpointing and evaluation
  
- **`ppo_env.py`** - Trading environment (Gymnasium)
  - Simulates live trading with realistic market conditions
  - Implements action space (direction, TP, SL, position size)
  - State space: OHLCV + 31 technical/structural features

- **`reward.py`** - Reward function
  - Calculates risk-adjusted returns
  - Penalties for drawdown, excessive risk, position holding
  - Bonuses for hitting TP, proper risk management

### Feature Engineering
- **`Data-Preparation.py`** - Primary data fetcher
  - Downloads OHLCV from Binance/Yahoo Finance
  - Normalizes and cleans data
  - Handles multiple timeframes

- **`features_pipeline.py`** - Feature orchestrator
  - Coordinates all feature extraction modules
  - Creates 31-feature vectors matching TypeScript inference

- **`build_indicator_features.py`** - Technical indicators
  - RSI, MACD, Bollinger Bands, ATR, Volume indicators
  - Uses pandas_ta for consistency

- **`fibo-features.py`** - Fibonacci features
  - Fibonacci retracement levels
  - Support/resistance zones
  - Price structure analysis

- **`entry_meta_features.py`** - Market regime features
  - Volatility regime detection
  - Trend strength
  - Market microstructure

- **`tp_sl_suggest.py`** - TP/SL calculations
  - ATR-based stop-loss suggestions
  - Dynamic take-profit levels
  - Risk-reward ratio optimization

## 🚀 System Requirements

### Hardware
- **GPU**: NVIDIA GPU with CUDA 11.8+ (recommended: RTX 3060 or better)
- **RAM**: 16GB minimum, 32GB recommended
- **Storage**: 50GB+ SSD for data caching

### Software
- **OS**: Ubuntu 22.04 LTS (recommended)
- **Python**: 3.10+
- **CUDA**: 11.8 or 12.1
- **Docker**: Optional but recommended

## 📦 Installation

### 1. Install Python Dependencies
```bash
cd python-training
pip install -r requirements.txt
```

### 2. Set Environment Variables
Create `.env` file:
```env
SUPABASE_URL=https://ncetkhcryoxchkodlzgj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
BINANCE_API_KEY=your_binance_key
BINANCE_API_SECRET=your_binance_secret
CUDA_VISIBLE_DEVICES=0
```

### 3. Verify GPU Access
```bash
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"
```

## 🎯 Training Workflow

### Phase 1: Initial Training (train_ppo.py)
```bash
python train_ppo.py --symbol BTCUSDT --user_id <uuid> --episodes 1000
```

**What happens:**
1. Fetches 2 years of OHLCV data from Binance
2. Extracts 31 features using `features_pipeline.py`
3. Initializes LSTM-PPO model (50k+ parameters)
4. Trains for 1000 episodes (~10-20 min on GPU)
5. Saves best model weights to `./checkpoints/`
6. Uploads model JSON to Supabase Storage

### Phase 2: Batch Online Learning
After every 100 live trades:
1. Edge function `online-ppo-update` triggers training
2. Fetches last 100 trades from `episodes` table
3. GPU server fine-tunes model using real trade data
4. Shadow model created and validated
5. If performance improves by 2%+, promotes to active

## 🔗 Supabase Integration

### Data Flow
```python
# 1. Fetch live trade episodes
supabase.table('episodes').select('*').eq('user_id', user_id).limit(100)

# 2. Upload trained model
model_json = convert_pytorch_to_json(model)
supabase.storage.from_('trained-models').upload(f'{user_id}/{symbol}/v{version}.json', model_json)

# 3. Update model metadata
supabase.table('asset_models').insert({
  'user_id': user_id,
  'symbol': symbol,
  'model_storage_path': storage_path,
  'performance_metrics': {'win_rate': 0.62, 'sharpe': 1.8},
  'model_status': 'pending'  # Requires validation before 'active'
})
```

### Model Format
PyTorch models are converted to JSON format compatible with TypeScript inference:
```json
{
  "lstm_weights_ih": [[...], [...]], // Input-to-hidden weights
  "lstm_weights_hh": [[...], [...]],  // Hidden-to-hidden weights
  "lstm_bias_ih": [...],
  "lstm_bias_hh": [...],
  "actor_weights": [[...], [...]],     // Policy head
  "actor_bias": [...],
  "critic_weights": [[...], [...]],    // Value head
  "critic_bias": [...]
}
```

## 📊 Training Metrics

Monitor training via logs:
```
Episode 1/1000 | Reward: -0.15 | Value Loss: 0.05 | Policy Loss: 0.02
Episode 100/1000 | Reward: 0.32 | Value Loss: 0.03 | Policy Loss: 0.01
Episode 500/1000 | Reward: 0.68 | Value Loss: 0.02 | Policy Loss: 0.008
Training complete | Final Reward: 0.85 | Win Rate: 64% | Sharpe: 2.1
```

## 🛠️ Configuration

### PPO Hyperparameters (train_ppo.py)
```python
PPO_CONFIG = {
    'gamma': 0.99,              # Discount factor
    'gae_lambda': 0.95,         # GAE parameter
    'clip_epsilon': 0.2,        # PPO clip range
    'learning_rate': 3e-4,      # Adam learning rate
    'entropy_coef': 0.01,       # Exploration bonus
    'value_coef': 0.5,          # Value loss weight
    'batch_size': 64,           # Mini-batch size
    'epochs': 10,               # PPO epochs per update
}
```

### Environment Config (ppo_env.py)
```python
ENV_CONFIG = {
    'initial_balance': 10000,   # Starting capital
    'max_position_size': 0.1,   # 10% per trade
    'commission': 0.001,        # 0.1% trading fee
    'slippage': 0.0005,         # 0.05% slippage
}
```

## 🐛 Troubleshooting

### GPU Not Detected
```bash
# Check CUDA installation
nvidia-smi

# Reinstall PyTorch with CUDA
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

### Out of Memory
```python
# Reduce batch size in train_ppo.py
batch_size = 32  # Instead of 64

# Or reduce sequence length
sequence_length = 10  # Instead of 20
```

### Feature Mismatch
Ensure features match TypeScript inference (31 features):
```python
# Verify feature count
features = extract_features(data)
assert features.shape[1] == 31, f"Expected 31 features, got {features.shape[1]}"
```

## 📈 Performance Expectations

### Training Time (RTX 3060)
- 100 episodes: ~2-3 minutes
- 1000 episodes: ~15-20 minutes
- 5000 episodes: ~60-90 minutes

### Memory Usage
- Model size: ~200KB (JSON)
- Training RAM: ~4-8GB
- GPU VRAM: ~2-4GB

### Model Performance
- Target win rate: 60-65%
- Target Sharpe ratio: 1.5-2.5
- Max drawdown: <15%

## 🔒 Security Notes

- Store Supabase service role key securely (use secrets manager)
- Never commit `.env` file to git
- Use RLS policies on Supabase tables
- Rotate API keys regularly

## 📚 Next Steps

1. **Deploy to Vultr**: See `DEPLOYMENT.md`
2. **Create FastAPI endpoint**: Wrap `train_ppo.py` in API
3. **Update edge function**: Call GPU server from TypeScript
4. **Monitor performance**: Track model metrics in Supabase
5. **Implement A/B testing**: Compare shadow vs active models

## 🤝 Support

For issues with:
- **Python training code**: Check logs in `./logs/`
- **Supabase integration**: Check edge function logs
- **GPU issues**: Verify CUDA installation with `nvidia-smi`

---

**Last Updated**: 2025-01-20  
**Version**: 1.0.0
