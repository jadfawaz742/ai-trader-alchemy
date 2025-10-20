# ===========================================================
# train_ppo.py — minimal training loop wiring
# - Loads features.parquet
# - Builds PPOTickEnv
# - Trains with your PPO (plug in your PPO impl or SB3)
# ===========================================================

from __future__ import annotations
import os
import pandas as pd
import torch
import torch.nn as nn
from torch.distributions import Categorical, Normal
import numpy as np

from ppo_env import PPOTickEnv
from reward import reward_function  # just to ensure import works

CRYPTO_ROOT = "PPO_Models/Crypto"

# ---------- Simple Actor-Critic (hybrid head) ----------
class ActorCritic(nn.Module):
    def __init__(self, state_dim: int, disc_n: int = 3, cont_n: int = 2):
        super().__init__()
        self.shared = nn.Sequential(
            nn.Linear(state_dim, 256), nn.ReLU(),
            nn.Linear(256, 256), nn.ReLU()
        )
        self.pi_disc = nn.Linear(256, disc_n)
        self.pi_mu   = nn.Linear(256, cont_n)
        self.pi_logstd = nn.Parameter(torch.zeros(cont_n))
        self.v_head  = nn.Linear(256, 1)

    def forward(self, x):
        z = self.shared(x)
        logits = self.pi_disc(z)
        mu     = torch.tanh(self.pi_mu(z))  # keep deltas in [-1,1] then env clamps
        std    = torch.exp(self.pi_logstd)
        v      = self.v_head(z).squeeze(-1)
        return logits, mu, std, v

# ---------- PPO utils ----------
def compute_gae(rewards, values, dones, gamma=0.99, lam=0.95):
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

def rollout(env, policy, n_steps: int, gamma=0.99, lam=0.95):
    obs_buf, actd_buf, actc_buf, r_buf, v_buf, logp_buf, done_buf = [], [], [], [], [], [], []
    obs, _ = env.reset()
    for _ in range(n_steps):
        x = torch.tensor(obs, dtype=torch.float32).unsqueeze(0)
        logits, mu, std, v = policy(x)
        distd = Categorical(logits=logits)
        actd  = distd.sample()
        distc = Normal(mu, std)
        actc  = distc.sample()
        logp  = distd.log_prob(actd) + distc.log_prob(actc).sum(-1)

        next_obs, reward, terminated, truncated, _ = env.step({
            "discrete": int(actd.item()),
            "continuous": actc.squeeze(0).detach().numpy().astype(np.float32)
        })

        obs_buf.append(obs)
        actd_buf.append(actd.item())
        actc_buf.append(actc.squeeze(0).detach().numpy())
        r_buf.append(reward)
        v_buf.append(v.item())
        logp_buf.append(logp.item())
        done_buf.append(1.0 if terminated else 0.0)

        obs = next_obs
        if terminated:
            obs, _ = env.reset()

    # bootstrap last value
    x = torch.tensor(obs, dtype=torch.float32).unsqueeze(0)
    with torch.no_grad():
        _, _, _, v_last = policy(x)
    v_buf.append(v_last.item())

    adv, ret = compute_gae(r_buf, v_buf, done_buf, gamma, lam)
    adv = (adv - adv.mean()) / (adv.std() + 1e-8)

    batch = {
        "obs": torch.tensor(np.array(obs_buf), dtype=torch.float32),
        "actd": torch.tensor(np.array(actd_buf), dtype=torch.long),
        "actc": torch.tensor(np.array(actc_buf), dtype=torch.float32),
        "ret": torch.tensor(ret, dtype=torch.float32),
        "adv": torch.tensor(adv, dtype=torch.float32),
        "logp_old": torch.tensor(np.array(logp_buf), dtype=torch.float32),
    }
    return batch

def ppo_update(policy, optimizer, batch,
               clip_eps=0.2, entropy_coef=0.01, value_coef=0.5,
               ppo_epochs=5, batch_size=256, max_grad_norm=0.5):
    obs   = batch["obs"]; actd = batch["actd"]; actc = batch["actc"]
    ret   = batch["ret"]; adv  = batch["adv"];  logp_old = batch["logp_old"]

    n = obs.size(0)
    idx = np.arange(n)
    for _ in range(ppo_epochs):
        np.random.shuffle(idx)
        for start in range(0, n, batch_size):
            sel = idx[start:start+batch_size]
            x = obs[sel]
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
            loss.backward()
            nn.utils.clip_grad_norm_(policy.parameters(), max_grad_norm)
            optimizer.step()

def train(symbol: str,
          n_steps=4096, total_updates=2000,
          ppo_epochs=5, batch_size=256, lr=3e-4,
          gamma=0.99, lam=0.95,
          ckpt_dir="PPO_Models/Crypto/CKPTS"):
    # load features
    fpath = os.path.join(CRYPTO_ROOT, symbol, "features", "features.parquet")
    if not os.path.exists(fpath):
        raise FileNotFoundError(f"Missing features: {fpath}")
    df = pd.read_parquet(fpath)

    # env
    env = PPOTickEnv(df, conf_threshold=0.30, use_suggestions=True)

    # policy
    state_dim = env.observation_space.shape[0]
    policy = ActorCritic(state_dim)
    optimizer = torch.optim.Adam(policy.parameters(), lr=lr)

    os.makedirs(ckpt_dir, exist_ok=True)

    steps = 0
    for upd in range(1, total_updates+1):
        batch = rollout(env, policy, n_steps=n_steps, gamma=gamma, lam=lam)
        ppo_update(policy, optimizer, batch,
                   ppo_epochs=ppo_epochs, batch_size=batch_size)
        steps += n_steps

        if upd % 50 == 0:
            path = os.path.join(ckpt_dir, f"{symbol}_ppo_{steps}.pt")
            torch.save(policy.state_dict(), path)
            print(f"[CKPT] {path}")

    final_path = os.path.join(ckpt_dir, f"{symbol}_ppo_final.pt")
    torch.save(policy.state_dict(), final_path)
    print(f"[DONE] saved {final_path}")

if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--symbol", required=True)
    p.add_argument("--steps", type=int, default=4096)
    p.add_argument("--updates", type=int, default=2000)
    args = p.parse_args()
    train(symbol=args.symbol, n_steps=args.steps, total_updates=args.updates)
