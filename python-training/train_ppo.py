"""
PPO Training Script with GPU Support
Trains a Proximal Policy Optimization agent on historical price data
with support for CUDA acceleration and mixed precision training.
"""

import os
import json
import torch
import torch.nn as nn
import numpy as np
import pandas as pd
from datetime import datetime
from typing import Optional
from torch.distributions import Categorical, Normal

from ppo_env import PPOTickEnv


def get_asset_root(symbol: str, asset_type: str = None) -> str:
    """
    Determine the appropriate directory path for asset-specific data and models.
    Auto-detects between cryptocurrencies and stocks if asset_type not provided.
    """
    if asset_type:
        base = os.path.join("PPO_Models", asset_type, symbol)
    else:
        # Auto-detect based on symbol pattern
        crypto_suffixes = ['USDT', 'BUSD', 'BTC', 'ETH', 'BNB', 'USDC']
        symbol_upper = symbol.upper()
        
        if any(symbol_upper.endswith(suffix) for suffix in crypto_suffixes):
            base = os.path.join("PPO_Models", "Cryptocurrencies", symbol)
        else:
            base = os.path.join("PPO_Models", "Stocks", symbol)
    
    os.makedirs(base, exist_ok=True)
    return base


class ActorCritic(nn.Module):
    """Neural network for PPO with discrete and continuous action outputs"""
    def __init__(self, state_dim: int, shared_hidden=256, action_dim_discrete=3, action_dim_continuous=2):
        super().__init__()
        self.shared = nn.Sequential(
            nn.Linear(state_dim, shared_hidden),
            nn.Tanh(),
            nn.Linear(shared_hidden, shared_hidden),
            nn.Tanh()
        )
        self.actor_discrete = nn.Linear(shared_hidden, action_dim_discrete)
        self.actor_continuous_mu = nn.Linear(shared_hidden, action_dim_continuous)
        self.actor_continuous_log_std = nn.Parameter(torch.zeros(action_dim_continuous))
        self.critic = nn.Linear(shared_hidden, 1)

    def forward(self, x):
        h = self.shared(x)
        logits = self.actor_discrete(h)
        mu = self.actor_continuous_mu(h)
        std = torch.exp(self.actor_continuous_log_std).expand_as(mu)
        v = self.critic(h).squeeze(-1)
        return logits, mu, std, v


def compute_gae(rewards, values, dones, gamma=0.99, lam=0.95):
    """Compute Generalized Advantage Estimation"""
    rewards = np.asarray(rewards, dtype=np.float32)
    values  = np.asarray(values, dtype=np.float32)
    dones   = np.asarray(dones, dtype=np.float32)
    adv = np.zeros_like(rewards, dtype=np.float32)
    lastgaelam = 0.0
    for t in reversed(range(len(rewards))):
        nonterminal = 1.0 - dones[t]
        delta = rewards[t] + gamma * values[t+1] * nonterminal - values[t]
        lastgaelam = delta + gamma * lam * nonterminal * lastgaelam
        adv[t] = lastgaelam
    returns = adv + values[:-1]
    return adv, returns


def rollout(env, policy, n_steps: int, gamma=0.99, lam=0.95, device: str = "cpu"):
    """Collect a batch of experience from the environment with GPU support"""
    obs_buf, actd_buf, actc_buf, r_buf, v_buf, logp_buf, done_buf = [], [], [], [], [], [], []
    obs, _ = env.reset()
    device_t = torch.device(device)
    
    for _ in range(n_steps):
        x = torch.tensor(obs, dtype=torch.float32, device=device_t).unsqueeze(0)
        
        with torch.no_grad():
            logits, mu, std, v = policy(x)
            distd = Categorical(logits=logits)
            distc = Normal(mu, std)
            
            actd = distd.sample()
            actc = distc.sample()
            logp = distd.log_prob(actd) + distc.log_prob(actc).sum(-1)
        
        actd_val = actd.item()
        actc_val = actc.squeeze(0).cpu().numpy()
        action = {"discrete": actd_val, "continuous": actc_val}
        
        obs_next, reward, terminated, truncated, info = env.step(action)
        done = terminated or truncated
        
        obs_buf.append(obs)
        actd_buf.append(actd_val)
        actc_buf.append(actc_val)
        r_buf.append(reward)
        v_buf.append(v.item())
        logp_buf.append(logp.item())
        done_buf.append(float(done))
        
        obs = obs_next
        if done:
            obs, _ = env.reset()
    
    # Bootstrap value for last state
    x = torch.tensor(obs, dtype=torch.float32, device=device_t).unsqueeze(0)
    with torch.no_grad():
        _, _, _, v_last = policy(x)
    v_buf.append(v_last.item())
    
    adv, ret = compute_gae(r_buf, v_buf, done_buf, gamma, lam)
    adv = (adv - adv.mean()) / (adv.std() + 1e-8)
    
    batch = {
        "obs": torch.tensor(np.array(obs_buf), dtype=torch.float32),
        "actd": torch.tensor(actd_buf, dtype=torch.long),
        "actc": torch.tensor(np.array(actc_buf), dtype=torch.float32),
        "ret": torch.tensor(ret, dtype=torch.float32),
        "adv": torch.tensor(adv, dtype=torch.float32),
        "logp_old": torch.tensor(logp_buf, dtype=torch.float32)
    }
    return batch


def ppo_update(policy, optimizer, batch,
               clip_eps=0.2, entropy_coef=0.01, value_coef=0.5,
               ppo_epochs=5, batch_size=256, max_grad_norm=0.5,
               device: str = "cpu"):
    """Perform PPO optimization step with GPU support and mixed precision"""
    device_t = torch.device(device)
    obs   = batch["obs"].to(device_t)
    actd  = batch["actd"].to(device_t)
    actc  = batch["actc"].to(device_t)
    ret   = batch["ret"].to(device_t)
    adv   = batch["adv"].to(device_t)
    logp_old = batch["logp_old"].to(device_t)

    n = obs.size(0)
    idx = np.arange(n)
    scaler = torch.cuda.amp.GradScaler(enabled=(device_t.type == "cuda"))
    
    for _ in range(ppo_epochs):
        np.random.shuffle(idx)
        for start in range(0, n, batch_size):
            sel = idx[start:start+batch_size]
            x = obs[sel]
            
            with torch.cuda.amp.autocast(enabled=(device_t.type == "cuda")):
                logits, mu, std, v = policy(x)
                distd = Categorical(logits=logits)
                distc = Normal(mu, std)
                logp = distd.log_prob(actd[sel]) + distc.log_prob(actc[sel]).sum(-1)
                ratio = torch.exp(logp - logp_old[sel])

                s1 = ratio * adv[sel]
                s2 = torch.clamp(ratio, 1-clip_eps, 1+clip_eps) * adv[sel]
                actor_loss = -torch.min(s1, s2).mean()
                value_loss = (v - ret[sel]).pow(2).mean()
                ent = distd.entropy().mean() + distc.entropy().sum(-1).mean()
                loss = actor_loss + value_coef*value_loss - entropy_coef*ent

            optimizer.zero_grad()
            scaler.scale(loss).backward()
            nn.utils.clip_grad_norm_(policy.parameters(), max_grad_norm)
            scaler.step(optimizer)
            scaler.update()


def train(symbol: str,
          asset_type: Optional[str] = None,
          n_steps=4096, total_updates=2000,
          ppo_epochs=5, batch_size=256, lr=3e-4,
          gamma=0.99, lam=0.95,
          device: str = "cpu"):
    """
    Train a PPO agent on historical price data with GPU support.
    
    Args:
        symbol: Asset symbol (e.g., BTCUSDT or AAPL)
        asset_type: Asset type (Cryptocurrencies or Stocks), auto-detected if None
        n_steps: Steps per rollout
        total_updates: Total number of PPO updates
        ppo_epochs: PPO epochs per update
        batch_size: Mini-batch size for PPO updates
        lr: Learning rate
        gamma: Discount factor
        lam: GAE lambda
        device: Device to use (cpu, cuda:0, cuda:1)
    """
    asset_root = get_asset_root(symbol, asset_type)
    
    # Load features
    fpath = os.path.join(asset_root, "features", "features.parquet")
    if not os.path.exists(fpath):
        raise FileNotFoundError(f"Missing features: {fpath}")
    df = pd.read_parquet(fpath)
    
    print(f"Loaded {len(df)} rows for {symbol}")
    
    # Initialize environment
    env = PPOTickEnv(df, conf_threshold=0.30, use_suggestions=True)
    
    # Initialize policy on device
    device_t = torch.device(device)
    state_dim = env.observation_space.shape[0]
    policy = ActorCritic(state_dim).to(device_t)
    optimizer = torch.optim.Adam(policy.parameters(), lr=lr)
    
    print(f"Training on device: {device}")
    print(f"State dim: {state_dim}, Total updates: {total_updates}")
    
    # Save checkpoints in asset-specific models folder
    ckpt_dir = os.path.join(asset_root, "models")
    os.makedirs(ckpt_dir, exist_ok=True)
    
    # Training loop
    steps = 0
    for upd in range(1, total_updates+1):
        batch = rollout(env, policy, n_steps=n_steps, gamma=gamma, lam=lam, device=device)
        ppo_update(policy, optimizer, batch,
                   ppo_epochs=ppo_epochs, batch_size=batch_size, device=device)
        steps += n_steps
        
        if upd % 50 == 0 or upd == 1:
            avg_reward = batch["ret"].mean().item()
            print(f"Update {upd}/{total_updates} | Avg Return: {avg_reward:.3f}")
            
            # Save checkpoint
            ckpt_path = os.path.join(ckpt_dir, f"checkpoint_step_{steps}.pt")
            torch.save(policy.state_dict(), ckpt_path)
            print(f"[CKPT] {ckpt_path}")
    
    # Helper function to convert PyTorch state dict to JSON-serializable format
    def state_dict_to_json(state_dict):
        """Convert PyTorch state dict to JSON-serializable format"""
        json_dict = {}
        for key, tensor in state_dict.items():
            json_dict[key] = tensor.cpu().detach().numpy().tolist()
        return json_dict
    
    # Save final model as JSON for TypeScript compatibility
    final_path = os.path.join(ckpt_dir, "final_model.json")
    model_json = state_dict_to_json(policy.state_dict())
    with open(final_path, "w") as f:
        json.dump(model_json, f)
    print(f"[DONE] saved {final_path} (JSON format)")
    
    # Save metadata
    metadata = {
        "symbol": symbol,
        "asset_type": asset_type or "auto-detected",
        "version": 1,
        "trained_at": datetime.utcnow().isoformat(),
        "total_updates": total_updates,
        "n_steps": n_steps,
        "sequence_length": 50,
        "ppo_epochs": ppo_epochs,
        "batch_size": batch_size,
        "lr": lr,
        "gamma": gamma,
        "lam": lam,
        "state_dim": state_dim,
        "hidden_size": 256,
        "model_path": final_path,
        "training_completed": True,
        "device": device
    }
    
    metadata_path = os.path.join(ckpt_dir, "model_metadata.json")
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"[METADATA] saved {metadata_path}")


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--symbol", required=True, help="Asset symbol (e.g., BTCUSDT or AAPL)")
    p.add_argument("--asset_type", choices=["Cryptocurrencies", "Stocks"], 
                   help="Asset type (optional, auto-detected if not provided)")
    p.add_argument("--steps", type=int, default=4096)
    p.add_argument("--updates", type=int, default=2000)
    p.add_argument("--device", default="cpu", help="cpu | cuda:0 | cuda:1")
    args = p.parse_args()
    
    train(symbol=args.symbol,
          asset_type=args.asset_type,
          n_steps=args.steps,
          total_updates=args.updates,
          device=args.device)
