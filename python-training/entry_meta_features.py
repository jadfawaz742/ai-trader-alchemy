# ===========================================================
#  entry_meta_features.py
#  Meta-features for ENTRY: interpretation + mislead flags
#  - Works on top of your existing indicator columns
#  - Adds helper signals (0..1) & flags so PPO learns WHEN to trust/ignore
#  - No hard-coded decisions, no TP/SL logic here
# ===========================================================

from __future__ import annotations
import numpy as np
import pandas as pd
import talib as ta  # swapped from pandas_ta to TA-Lib

def _clamp01(x):
    return np.clip(x, 0.0, 1.0)

def _tanh_scale(x, s=1.0):
    return np.tanh(np.asarray(x, dtype=float) / float(s))

def _safe_div_num(x, y, default=0.0):
    y = np.asarray(y, dtype=float)
    x = np.asarray(x, dtype=float)
    out = np.where((y == 0) | ~np.isfinite(y), default, x / y)
    return out

def build_entry_meta_features(
    df: pd.DataFrame,
    rsi_hot=0.70, rsi_cold=0.30,
    adx_trend=0.25,           # ADX above this → trendier (remember your ADX is 0..1 normalized)
    atr_mid_window=200,       # for volatility comfort median/std
) -> pd.DataFrame:
    """
    INPUT: df with the following (from your indicator builder):
      close, price_change, vol_norm, momentum_5, momentum_20,
      sma10_pos, sma20_pos, rsi (0..1), macd, volatility,
      atr, atr_norm, obv_norm, boll_pos (-1..1), price_range,
      ema50_pos, adx (0..1), ma50, ma50_slope,
      accumulation, advancing, distribution, declining, vol_regime (0/1/2)

    OUTPUT: same df with extra meta-features for ENTRY:
      Trend & regime understanding
      RSI interpretation + trap flags
      MACD interpretation + conflict flags
      Bollinger (breakout vs mean-revert) context
      OBV/volume pressure & reliability
      Momentum agreement/divergence
      Range/chop detectors (when indicators mislead)
      A compact trend_score & trend_conf (0..1) reused by PPO

    All new features are NaN-safe and clipped to [0,1] when appropriate.
    """

    out = df.copy()

    # ---------- Trend score & confidence (re-usable baseline) ----------
    # Directional intention (signed), then magnitude-only confidence
    trend_score = (
        0.2 * _tanh_scale(out["ema50_pos"], s=0.03) +   # small scale to make tanh responsive
        0.2 * _tanh_scale(out["sma20_pos"], s=0.03) +
        0.3 * _tanh_scale(out["momentum_20"], s=0.02) +
        0.2 * _tanh_scale(out["macd"], s=0.005) +
        0.1 * (out["rsi"] - 0.5)
    ).astype(float)

    out["trend_score"] = trend_score
    out["trend_dir"]   = np.sign(trend_score).astype(float)     # -1/0/+1 (soft 0s when score small)
    out["trend_conf"]  = _clamp01(_tanh_scale(np.abs(trend_score), s=0.4))  # 0..1

    # ---------- Volatility comfort (mid > extremes) ----------
    atrn = out["atr_norm"].astype(float).values
    vol_center = pd.Series(atrn).rolling(atr_mid_window, min_periods=50).median()
    vol_scale  = pd.Series(atrn).rolling(atr_mid_window, min_periods=50).std().replace(0, np.nan)
    vol_score  = 1 - np.abs((atrn - vol_center.values) / (vol_scale.values + 1e-9))
    out["vol_comfort"] = _clamp01(vol_score)

    # ---------- Regime helpers ----------
    out["regime_trending"] = _clamp01(out["adx"] / max(adx_trend, 1e-6))  # higher → more trending
    out["regime_chop"]     = ((out["vol_regime"] == 0) & (out["adx"] < adx_trend)).astype(float)

    # ---------- RSI interpretation & traps ----------
    rsi = out["rsi"].astype(float).values
    out["rsi_long_bias"]  = _clamp01((rsi - 0.55) / 0.15)      # smoothly >0 near 0.55..1.0
    out["rsi_short_bias"] = _clamp01((0.45 - rsi) / 0.15)      # smoothly >0 near 0..0.45

    rsi_ob = (rsi >= rsi_hot).astype(float)
    rsi_os = (rsi <= rsi_cold).astype(float)

    # RSI traps: fading overbought in an uptrend or fading oversold in a downtrend
    td = out["trend_dir"].values
    out["rsi_fade_risky"] = ((rsi_ob & (td > 0)) | (rsi_os & (td < 0))).astype(float)

    # RSI reliability: in trending regimes, raw RSI edges are less reliable for contrarian entries
    out["rsi_reliability"] = _clamp01(1.0 - out["regime_trending"])  # contrarian reliability

    # ---------- MACD interpretation & conflicts ----------
    macd = out["macd"].astype(float).values
    out["macd_bullish"] = (macd > 0).astype(float)
    out["macd_bearish"] = (macd < 0).astype(float)

    # Conflict if MACD disagrees with price location vs MA50 (bull MACD but below MA50 = trap risk)
    above_ma = (out["ema50_pos"] > 0).astype(float)
    below_ma = (out["ema50_pos"] < 0).astype(float)
    out["macd_conflict"] = ((out["macd_bullish"] * below_ma) + (out["macd_bearish"] * above_ma)).astype(float)

    # MACD reliability: higher with stronger trend & non-squeeze volatility
    out["macd_reliability"] = _clamp01(0.6 * out["regime_trending"] + 0.4 * (out["vol_regime"] >= 1).astype(float))

    # ---------- Bollinger / Mean-reversion context ----------
    # Recompute BB width robustly (we need width, not just position). Falls back to zeros if TA-Lib fails.
    try:
        upper, middle, lower = ta.BBANDS(
            out["close"].values.astype(float),
            timeperiod=20, nbdevup=2, nbdevdn=2, matype=0
        )
        bb_width = _safe_div_num((upper - lower), out["close"].values, default=0.0)
    except Exception:
        bb_width = np.zeros(len(out), dtype=float)

    # Normalize width relative to its rolling median (adaptive squeeze detector)
    bw_med = pd.Series(bb_width).rolling(200, min_periods=50).median().replace(0, np.nan).values
    bb_squeeze = _clamp01(1.0 - _safe_div_num(bb_width, bw_med, default=0.0))  # higher → more squeezed

    out["bb_squeeze"] = bb_squeeze
    out["bb_breakout_bias_long"]  = _clamp01(((out["boll_pos"] > 0.8).astype(float)) * (1.0 - bb_squeeze/2))
    out["bb_breakout_bias_short"] = _clamp01(((out["boll_pos"] < -0.8).astype(float)) * (1.0 - bb_squeeze/2))
    out["mr_pressure"] = _clamp01(1 - np.abs(out["boll_pos"]).astype(float))  # center pull

    # Invalidation: “breakout” signal in deep squeeze + low ADX is often fake
    out["bb_breakout_risky"] = _clamp01(bb_squeeze * (1.0 - out["regime_trending"]))

    # ---------- OBV / Volume pressure & reliability ----------
    # OBV pressure using change-rate & volume normalization
    obv_norm = out["obv_norm"].astype(float).values
    obv_chg  = pd.Series(obv_norm).pct_change().fillna(0.0).values * 100.0
    raw_press = (out["vol_norm"].astype(float).values - 1.0) * obv_chg
    # squash to 0..1
    out["obv_pressure"] = _clamp01(1.0 / (1.0 + np.exp(-raw_press)))

    # Reliability: decent volume and mid/high vol regime
    out["obv_reliability"] = _clamp01(0.5 * _clamp01(out["vol_norm"] - 0.8) + 0.5 * (out["vol_regime"] >= 1).astype(float))

    # ---------- Momentum agreement & divergence ----------
    m5  = out["momentum_5"].astype(float).values
    m20 = out["momentum_20"].astype(float).values
    same_sign = ((np.sign(m5) == np.sign(m20)) & (np.sign(m20) != 0)).astype(float)
    out["mom_agreement"] = same_sign
    # Divergence proxy: price up but m20 down, or price down but m20 up
    pc = out["price_change"].astype(float).values
    out["mom_divergence"] = ((np.sign(pc) != np.sign(m20)) & (np.sign(m20) != 0)).astype(float)

    # ---------- Range/Chop detectors (mislead hubs) ----------
    # In chop, trend-following signals (MACD/EMA alignment) are less reliable
    out["range_chop_flag"] = ((out["vol_regime"] == 0) & (out["adx"] < adx_trend)).astype(float)
    # In violent high-vol spikes, mean-reversion entries are risky
    out["mr_risky_highvol"] = ((out["vol_regime"] == 2).astype(float))

    # ---------- MA alignment helpers ----------
    ema_pos = np.sign(out["ema50_pos"].astype(float).values)
    sma_pos = np.sign(out["sma20_pos"].astype(float).values)
    out["ma_alignment"] = (ema_pos == sma_pos).astype(float)
    out["phase_alignment"] = ((out["advancing"] > 0) & (out["trend_dir"] > 0) | (out["declining"] > 0) & (out["trend_dir"] < 0)).astype(float)

    # ---------- Final NaN safety & clipping ----------
    add_cols = [
        "trend_score","trend_dir","trend_conf","vol_comfort",
        "regime_trending","regime_chop",
        "rsi_long_bias","rsi_short_bias","rsi_fade_risky","rsi_reliability",
        "macd_bullish","macd_bearish","macd_conflict","macd_reliability",
        "bb_squeeze","bb_breakout_bias_long","bb_breakout_bias_short","mr_pressure","bb_breakout_risky",
        "obv_pressure","obv_reliability",
        "mom_agreement","mom_divergence",
        "range_chop_flag","mr_risky_highvol",
        "ma_alignment","phase_alignment",
    ]
    out[add_cols] = out[add_cols].replace([np.inf, -np.inf], 0.0).fillna(0.0)
    # clamp to [0,1] where it makes sense
    clamp_cols = [c for c in add_cols if c not in ("trend_score","trend_dir")]
    out[clamp_cols] = out[clamp_cols].clip(0.0, 1.0)

    return out
