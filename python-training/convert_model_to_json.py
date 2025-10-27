#!/usr/bin/env python3
"""
Convert PyTorch .pt model to JSON format for TypeScript compatibility.
Usage: python convert_model_to_json.py --symbol BTCUSDT [--asset-type crypto]
"""
import os
import json
import argparse
import torch
import torch.nn as nn


def get_asset_root(symbol: str, asset_type: str = None) -> str:
    """Determine asset directory (crypto vs stock)"""
    if asset_type:
        asset_type = asset_type.lower()
    else:
        asset_type = "cryptocurrencies" if symbol.endswith("USDT") else "stocks"
    
    if asset_type in ["crypto", "cryptocurrencies"]:
        root = os.path.join("PPO_Models", "Cryptocurrencies", symbol)
    else:
        root = os.path.join("PPO_Models", "Stocks", symbol)
    
    return root


class ActorCritic(nn.Module):
    """PPO Actor-Critic Network - must match train_ppo.py architecture"""
    def __init__(self, obs_dim=50, hidden=128, n_discrete=3, continuous_dim=3):
        super().__init__()
        self.shared = nn.Sequential(
            nn.Linear(obs_dim, hidden),
            nn.Tanh(),
            nn.Linear(hidden, hidden),
            nn.Tanh(),
        )
        self.actor_discrete = nn.Linear(hidden, n_discrete)
        self.actor_mu = nn.Linear(hidden, continuous_dim)
        self.actor_logstd = nn.Parameter(torch.zeros(continuous_dim))
        self.critic = nn.Linear(hidden, 1)

    def forward(self, x):
        h = self.shared(x)
        discrete_logits = self.actor_discrete(h)
        mu = self.actor_mu(h)
        value = self.critic(h)
        return discrete_logits, mu, self.actor_logstd, value


def state_dict_to_json(state_dict):
    """Convert PyTorch state dict to JSON-serializable format"""
    json_dict = {}
    for key, tensor in state_dict.items():
        json_dict[key] = tensor.cpu().detach().numpy().tolist()
    return json_dict


def convert_model(symbol: str, asset_type: str = None):
    """Convert .pt model to .json format"""
    asset_root = get_asset_root(symbol, asset_type)
    ckpt_dir = os.path.join(asset_root, "checkpoints")
    
    pt_path = os.path.join(ckpt_dir, "final_model.pt")
    json_path = os.path.join(ckpt_dir, "final_model.json")
    
    print(f"🔍 Looking for model at: {pt_path}")
    
    if not os.path.exists(pt_path):
        print(f"❌ ERROR: Model file not found at {pt_path}")
        print(f"   Available files in {ckpt_dir}:")
        if os.path.exists(ckpt_dir):
            for f in os.listdir(ckpt_dir):
                print(f"     - {f}")
        return False
    
    print(f"✅ Found model file ({os.path.getsize(pt_path)} bytes)")
    
    # Load the PyTorch model
    print("📦 Loading PyTorch model...")
    policy = ActorCritic(obs_dim=50, hidden=128)
    
    try:
        state_dict = torch.load(pt_path, map_location="cpu")
        policy.load_state_dict(state_dict)
        print(f"✅ Loaded state dict with {len(state_dict)} parameters")
    except Exception as e:
        print(f"❌ ERROR loading model: {e}")
        return False
    
    # Convert to JSON
    print("🔄 Converting to JSON format...")
    model_json = state_dict_to_json(policy.state_dict())
    
    # Validate structure
    required_keys = [
        'shared.0.weight', 'shared.0.bias',
        'shared.2.weight', 'shared.2.bias',
        'actor_discrete.weight', 'actor_discrete.bias',
        'actor_mu.weight', 'actor_mu.bias',
        'actor_logstd',
        'critic.weight', 'critic.bias'
    ]
    
    missing = [k for k in required_keys if k not in model_json]
    if missing:
        print(f"❌ WARNING: Missing keys: {missing}")
    else:
        print(f"✅ All {len(required_keys)} required parameters present")
    
    # Save JSON
    print(f"💾 Saving to: {json_path}")
    with open(json_path, "w") as f:
        json.dump(model_json, f)
    
    json_size = os.path.getsize(json_path)
    print(f"✅ Conversion complete!")
    print(f"   - Original .pt: {os.path.getsize(pt_path):,} bytes")
    print(f"   - New .json: {json_size:,} bytes")
    print(f"   - Parameters: {len(model_json)}")
    
    print("\n📋 Next steps:")
    print(f"   1. Upload {json_path} to Supabase Storage bucket 'trained-models'")
    print(f"      at path: 'trained models/final_model.json'")
    print(f"   2. Update asset_models.model_storage_path to point to JSON file")
    print(f"   3. Test signal generation")
    
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert PyTorch model to JSON")
    parser.add_argument("--symbol", type=str, required=True, help="Asset symbol (e.g., BTCUSDT)")
    parser.add_argument("--asset-type", type=str, help="Asset type: crypto/cryptocurrencies or stock/stocks")
    
    args = parser.parse_args()
    
    success = convert_model(args.symbol, args.asset_type)
    exit(0 if success else 1)
