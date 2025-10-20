# ===========================================================
# ppo_env.py — Single-trade-per-decision env (no explicit exit)
# - Steps sequentially through all candles
# - Action: 0=NO_TRADE, 1=ENTER_LONG, 2=ENTER_SHORT
# - When a trade is opened, env simulates forward until TP/SL hit,
#   computes reward, and jumps to the bar AFTER exit.
# - Uses reward_function from reward.py
# ===========================================================

from __future__ import annotations
import numpy as np
import pandas as pd
import gymnasium as gym
from gymnasium import spaces

# import your reward
from reward import reward_function

class PPOTickEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(
        self,
        df: pd.DataFrame,
        feature_cols: list[str] | None = None,
        tp_bounds=(0.8, 3.0),
        sl_bounds=(0.5, 1.6),
        conf_threshold: float = 0.30,
        max_policy_delta_tp: float = 0.5,   # action continuous head clamp
        max_policy_delta_sl: float = 0.3,   # action continuous head clamp
        use_suggestions: bool = True,       # start from tp/sl suggestions if available
    ):
        super().__init__()
        self.df = df.reset_index(drop=True)

        # choose features automatically (all numeric) if not provided
        if feature_cols is None:
            ignore = {"open_time", "close_time", "tp_source", "sl_source", "asset"}
            num_cols = [c for c in self.df.columns if c not in ignore and np.issubdtype(self.df[c].dtype, np.number)]
            self.feature_cols = num_cols
        else:
            self.feature_cols = feature_cols

        self.tp_bounds = tp_bounds
        self.sl_bounds = sl_bounds
        self.conf_threshold = conf_threshold
        self.max_policy_delta_tp = max_policy_delta_tp
        self.max_policy_delta_sl = max_policy_delta_sl
        self.use_suggestions = use_suggestions

        self.observation_space = spaces.Box(
            low=-np.inf, high=np.inf, shape=(len(self.feature_cols),), dtype=np.float32
        )
        self.action_space = spaces.Dict({
            "discrete":   spaces.Discrete(3),  # 0 no-trade, 1 long, 2 short
            "continuous": spaces.Box(low=np.array([-self.max_policy_delta_tp, -self.max_policy_delta_sl], np.float32),
                                     high=np.array([+self.max_policy_delta_tp, +self.max_policy_delta_sl], np.float32),
                                     dtype=np.float32)
        })

        # internal
        self.i = 0   # current decision index
        self.n = len(self.df)

    def _obs(self, idx: int) -> np.ndarray:
        return self.df.loc[idx, self.feature_cols].astype(np.float32).values

    def reset(self, *, seed: int | None = None, options: dict | None = None):
        super().reset(seed=seed)
        # start at first valid row
        self.i = 0
        obs = self._obs(self.i)
        return obs, {}

    def step(self, action: dict):
        """
        If NO_TRADE: advance by 1 bar, small penalty (optional) = 0 here.
        If ENTER_*: simulate forward until TP/SL hit, compute reward,
                    set index to bar AFTER exit.
        """
        if self.i >= self.n - 2:
            # terminal if no space to move
            return self._obs(self.i), 0.0, True, False, {}

        # parse action
        disc = int(action["discrete"]) if isinstance(action, dict) else int(action)
        cont = action.get("continuous", np.zeros(2, dtype=np.float32)) if isinstance(action, dict) else np.zeros(2, dtype=np.float32)
        delta_tp = float(np.clip(cont[0], -self.max_policy_delta_tp, self.max_policy_delta_tp))
        delta_sl = float(np.clip(cont[1], -self.max_policy_delta_sl, self.max_policy_delta_sl))

        row = self.df.iloc[self.i]
        conf = float(row.get("conf_entry_final", 0.0))

        # low confidence gate → force NO_TRADE
        if abs(conf) < self.conf_threshold:
            disc = 0

        info = {}
        terminated = False
        truncated  = False

        if disc == 0:
            # NO_TRADE → step forward one bar
            self.i += 1
            obs = self._obs(self.i)
            reward = 0.0  # you can add tiny time-decay penalty if desired
            return obs, float(reward), terminated, truncated, info

        # ENTER logic
        side = 1 if disc == 1 else -1  # 1 long, -1 short
        close = float(row["close"])
        atr   = float(row["atr"])

        # baseline multipliers
        if self.use_suggestions:
            fTP_base = float(row.get("tp_mult_suggested", 1.2))
            fSL_base = float(row.get("sl_mult_suggested", 1.0))
        else:
            # fallback: mild defaults
            fTP_base, fSL_base = 1.2, 1.0

        # apply deltas & safety clamps
        fTP = np.clip(fTP_base * (1.0 + delta_tp), self.tp_bounds[0], self.tp_bounds[1])
        fSL = np.clip(fSL_base * (1.0 + delta_sl), self.sl_bounds[0], self.sl_bounds[1])

        tp_dist = atr * fTP
        sl_dist = atr * fSL

        # compute absolute levels
        if side == 1:   # long
            tp_price = close + tp_dist
            sl_price = close - sl_dist
        else:           # short
            tp_price = close - tp_dist
            sl_price = close + sl_dist

        # simulate forward until hit
        j = self.i + 1
        hit_tp = hit_sl = False
        exit_price = float(self.df.iloc[j]["close"])  # default if neither hit by end (safety)
        while j < self.n:
            hi = float(self.df.iloc[j]["high"])
            lo = float(self.df.iloc[j]["low"])
            cl = float(self.df.iloc[j]["close"])
            # check hits
            if side == 1:
                if hi >= tp_price:
                    hit_tp = True
                    exit_price = tp_price
                    break
                if lo <= sl_price:
                    hit_sl = True
                    exit_price = sl_price
                    break
            else:
                if lo <= tp_price:
                    hit_tp = True
                    exit_price = tp_price
                    break
                if hi >= sl_price:
                    hit_sl = True
                    exit_price = sl_price
                    break
            # continue scanning
            exit_price = cl
            j += 1

        # compute pnl in price units
        pnl = (exit_price - close) * side  # positive if favorable

        # reward
        reward = reward_function(
            pnl=pnl,
            atr=atr,
            conf=conf,
            tp_dist=tp_dist,
            sl_dist=sl_dist,
            sent=float(row.get("sentiment", 0.0)),
            news=float(row.get("news_vol", 0.0)),
        )

        # jump index to bar AFTER exit (or last)
        self.i = min(j + 1, self.n - 1)
        obs = self._obs(self.i)
        return obs, float(reward), terminated, truncated, {
            "hit_tp": hit_tp, "hit_sl": hit_sl,
            "tp_price": tp_price, "sl_price": sl_price,
            "entry_price": close, "exit_price": exit_price,
            "fTP": float(fTP), "fSL": float(fSL),
            "conf": conf
        }
