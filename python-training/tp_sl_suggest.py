# ===========================================================
#  tp_sl_suggest.py
#  Context-aware TP/SL suggestions from Fib + S/R candidates
#  - Uses indicators & regime features to score each candidate
#  - Returns suggested ATR multipliers + which candidate won
#  - Pure suggestions; does NOT modify your existing fTP/fSL logic
# ===========================================================

from __future__ import annotations
import numpy as np
import pandas as pd

# Helper: safe get column or default 0
def _col(df: pd.DataFrame, name: str, default=0.0):
    return df[name].values if name in df.columns else np.zeros(len(df), dtype=float)

def _clamp01(x): return np.clip(x, 0.0, 1.0)
def _tanh(x, s=1.0): return np.tanh(np.asarray(x, dtype=float) / float(s))

def build_tp_sl_suggestions(df: pd.DataFrame) -> pd.DataFrame:
    """
    INPUT df must already contain at least:
      # Confidence / trend context (hybrid ok)
      - conf_entry_final  (or conf_dir + conf_str)
      - trend_conf, trend_score or equivalents (trend_dir is useful)
      # Reliability / mislead helpers (from entry_meta_features.py)
      - vol_comfort, regime_trending, range_chop_flag, bb_breakout_risky
      - macd_bullish, macd_bearish, macd_conflict, rsi_long_bias, rsi_short_bias, rsi_fade_risky
      - obv_pressure (optional), obv_reliability (optional)
      # Structural distances in ATR units (from fib_features.py)
      - fib_ext_127, fib_ext_161, fib_ext_200
      - fib_ret_236, fib_ret_382, fib_ret_500, fib_ret_618, fib_ret_786
      - sr_resistance_1_dist, sr_resistance_2_dist
      - sr_support_1_dist,    sr_support_2_dist
      # Optional S/R strength (if you kept it in your base indicators)
      - sr_strength (0..1)  (optional)

    OUTPUT: returns a copy with added columns:
      - tp_mult_suggested   (>=0, ATR units)
      - sl_mult_suggested   (>=0, ATR units)
      - tp_source           (string label: F127/F161/F200/R1/R2/NA)
      - sl_source           (string label: RET236/RET382/RET500/RET618/RET786/S1/S2/NA)
      - tp_score_best, sl_score_best  (for debugging/analysis)
    """
    out = df.copy()
    n = len(out)

    # ----- Get core context -----
    if "conf_dir" in out.columns and "conf_str" in out.columns:
        conf_dir = np.sign(_col(out, "conf_dir"))
        conf_str = _clamp01(_col(out, "conf_str"))
    else:
        conf_raw = _col(out, "conf_entry_final")
        conf_dir = np.sign(conf_raw)
        conf_str = _clamp01(np.abs(conf_raw))

    trend_conf      = _clamp01(_col(out, "trend_conf"))
    trend_dir       = np.sign(_col(out, "trend_dir")) if "trend_dir" in out.columns else np.sign(_col(out, "trend_score"))
    vol_comfort     = _clamp01(_col(out, "vol_comfort"))
    regime_trending = _clamp01(_col(out, "regime_trending"))
    range_chop_flag = _clamp01(_col(out, "range_chop_flag"))
    bb_break_risky  = _clamp01(_col(out, "bb_breakout_risky"))
    macd_conflict   = _clamp01(_col(out, "macd_conflict"))
    rsi_fade_risky  = _clamp01(_col(out, "rsi_fade_risky"))
    obv_pressure    = _clamp01(_col(out, "obv_pressure"))
    obv_reliability = _clamp01(_col(out, "obv_reliability"))
    sr_strength     = _clamp01(_col(out, "sr_strength"))  # optional; zeros if absent

    # Bull/bear tilts for extra nuance (optional)
    macd_bullish    = _clamp01(_col(out, "macd_bullish"))
    macd_bearish    = _clamp01(_col(out, "macd_bearish"))
    rsi_long_bias   = _clamp01(_col(out, "rsi_long_bias"))
    rsi_short_bias  = _clamp01(_col(out, "rsi_short_bias"))

    # ----- Candidate distances (ATR units; non-negative) -----
    # LONG-side TP candidates (ceiling): fib extensions + R1/R2
    ext127 = np.abs(_col(out, "fib_ext_127"));  ext161 = np.abs(_col(out, "fib_ext_161"));  ext200 = np.abs(_col(out, "fib_ext_200"))
    R1 = _clamp01(_col(out, "sr_resistance_1_dist") / 50.0) * 50.0  # keep numeric scale similar; we clipped to 50 upstream
    R2 = _clamp01(_col(out, "sr_resistance_2_dist") / 50.0) * 50.0

    # SHORT-side TP candidates (floor) are symmetric; we’ll reuse same arrays based on conf_dir.

    # LONG-side SL candidates (floor): fib retracements + S1/S2
    RET236 = np.abs(_col(out, "fib_ret_236")); RET382 = np.abs(_col(out, "fib_ret_382")); RET500 = np.abs(_col(out, "fib_ret_500"))
    RET618 = np.abs(_col(out, "fib_ret_618")); RET786 = np.abs(_col(out, "fib_ret_786"))
    S1 = _clamp01(_col(out, "sr_support_1_dist") / 50.0) * 50.0
    S2 = _clamp01(_col(out, "sr_support_2_dist") / 50.0) * 50.0

    # A tiny epsilon to avoid pathological 0s when suggesting multipliers
    eps = 1e-6

    # ----- Scoring helpers -----
    # How much we allow farther TP: rises with conviction & trend; falls with chop/risk
    allow_far = _clamp01(0.55*conf_str + 0.35*trend_conf + 0.10*obv_pressure - 0.30*range_chop_flag - 0.20*bb_break_risky)
    # Penalty for unreliable context
    context_risk = _clamp01(0.35*range_chop_flag + 0.25*bb_break_risky + 0.20*macd_conflict + 0.20*rsi_fade_risky)

    # Reach curves for distance (tanh saturates): prefer farther when allow_far high; prefer closer when low/risky
    def tp_reach_score(dist):
        d = _tanh(dist, s=4.0)  # 0..~1 as dist grows
        return _clamp01(allow_far * d + (1 - allow_far) * (1 - d) - 0.3*context_risk)

    # For SL, when risk is high, prefer closer stops; when conviction high, tolerate wider if structure supports
    base_risk = _clamp01(1.0 - (0.6*conf_str + 0.4*trend_conf))  # 1=very risky, 0=very safe
    def sl_reach_score(dist, support_bonus=0.0):
        d = _tanh(dist, s=3.0)
        # risk high → (1 - d) rewarded (closer); risk low → d rewarded (wider ok)
        score = base_risk * (1 - d) + (1 - base_risk) * d
        return _clamp01(score + support_bonus - 0.25*range_chop_flag)

    # If we had SR-blocking flags we would use them; approximate: a fib ext is "blocked" if R1 closer than the ext
    ext127_blocked = (R1 < ext127).astype(float)
    ext161_blocked = (R1 < ext161).astype(float)
    ext200_blocked = (R1 < ext200).astype(float)

    # ----- Build TP candidate scores (we’ll compute both long/short but choose by conf_dir) -----
    # Extra trend/indicator tilts
    long_bias  = _clamp01(0.5*trend_conf + 0.25*macd_bullish + 0.25*rsi_long_bias)
    short_bias = _clamp01(0.5*trend_conf + 0.25*macd_bearish + 0.25*rsi_short_bias)

    # Long-side TP scores
    tp_scores_long = {
        "F127": _clamp01(0.35*tp_reach_score(ext127) + 0.35*long_bias + 0.15*obv_reliability - 0.30*ext127_blocked - 0.20*sr_strength),
        "F161": _clamp01(0.35*tp_reach_score(ext161) + 0.35*long_bias + 0.15*obv_reliability - 0.30*ext161_blocked - 0.20*sr_strength),
        "F200": _clamp01(0.35*tp_reach_score(ext200) + 0.35*long_bias + 0.15*obv_reliability - 0.30*ext200_blocked - 0.20*sr_strength),
        "R1":   _clamp01(0.30*tp_reach_score(R1)     + 0.40*long_bias + 0.10*obv_reliability - 0.35*sr_strength),
        "R2":   _clamp01(0.25*tp_reach_score(R2)     + 0.35*long_bias + 0.10*obv_reliability - 0.30*sr_strength),
    }
    tp_dists_long = {"F127": ext127+eps, "F161": ext161+eps, "F200": ext200+eps, "R1": R1+eps, "R2": R2+eps}

    # Short-side TP scores (mirror idea; floors)
    tp_scores_short = {
        "F127": _clamp01(0.35*tp_reach_score(ext127) + 0.35*short_bias + 0.15*obv_reliability - 0.30*ext127_blocked - 0.20*sr_strength),
        "F161": _clamp01(0.35*tp_reach_score(ext161) + 0.35*short_bias + 0.15*obv_reliability - 0.30*ext161_blocked - 0.20*sr_strength),
        "F200": _clamp01(0.35*tp_reach_score(ext200) + 0.35*short_bias + 0.15*obv_reliability - 0.30*ext200_blocked - 0.20*sr_strength),
        "S1":   _clamp01(0.30*tp_reach_score(S1)     + 0.40*short_bias + 0.10*obv_reliability - 0.35*sr_strength),
        "S2":   _clamp01(0.25*tp_reach_score(S2)     + 0.35*short_bias + 0.10*obv_reliability - 0.30*sr_strength),
    }
    tp_dists_short = {"F127": ext127+eps, "F161": ext161+eps, "F200": ext200+eps, "S1": S1+eps, "S2": S2+eps}

    # ----- Build SL candidate scores -----
    # Long: SL from supports or fib retracements
    sl_scores_long = {
        "S1":    sl_reach_score(S1, support_bonus=+0.20*sr_strength),
        "S2":    sl_reach_score(S2, support_bonus=+0.15*sr_strength),
        "RET236":sl_reach_score(RET236, support_bonus=+0.05),
        "RET382":sl_reach_score(RET382, support_bonus=+0.10),
        "RET500":sl_reach_score(RET500, support_bonus=+0.12),
        "RET618":sl_reach_score(RET618, support_bonus=+0.15),
        "RET786":sl_reach_score(RET786, support_bonus=+0.18),
    }
    sl_dists_long = {"S1":S1+eps,"S2":S2+eps,"RET236":RET236+eps,"RET382":RET382+eps,"RET500":RET500+eps,"RET618":RET618+eps,"RET786":RET786+eps}

    # Short: SL from resistances or fib retracements (mirror)
    sl_scores_short = {
        "R1":    sl_reach_score(R1, support_bonus=+0.20*sr_strength),
        "R2":    sl_reach_score(R2, support_bonus=+0.15*sr_strength),
        "RET236":sl_reach_score(RET236, support_bonus=+0.05),
        "RET382":sl_reach_score(RET382, support_bonus=+0.10),
        "RET500":sl_reach_score(RET500, support_bonus=+0.12),
        "RET618":sl_reach_score(RET618, support_bonus=+0.15),
        "RET786":sl_reach_score(RET786, support_bonus=+0.18),
    }
    sl_dists_short = {"R1":R1+eps,"R2":R2+eps,"RET236":RET236+eps,"RET382":RET382+eps,"RET500":RET500+eps,"RET618":RET618+eps,"RET786":RET786+eps}

    # ----- Choose best per row depending on conf_dir -----
    tp_source = np.full(n, "NA", dtype=object)
    sl_source = np.full(n, "NA", dtype=object)
    tp_best   = np.zeros(n, dtype=float)
    sl_best   = np.zeros(n, dtype=float)
    tp_score_best = np.zeros(n, dtype=float)
    sl_score_best = np.zeros(n, dtype=float)

    long_mask  = (conf_dir >= 0)  # tie or positive → treat as long bias
    short_mask = (conf_dir <  0)

    # LONG side picks
    if long_mask.any():
        idx = np.where(long_mask)[0]
        # stack scores into arrays shape (n_candidates, n_idx)
        tp_cands = ["F127","F161","F200","R1","R2"]
        sl_cands = ["S1","S2","RET236","RET382","RET500","RET618","RET786"]

        tp_mat = np.vstack([tp_scores_long[k][idx] for k in tp_cands])
        tp_winner = np.argmax(tp_mat, axis=0)
        for j, row_i in enumerate(idx):
            k = tp_cands[tp_winner[j]]
            tp_source[row_i] = k
            tp_best[row_i]   = float(tp_dists_long[k][row_i])
            tp_score_best[row_i] = float(tp_scores_long[k][row_i])

        sl_mat = np.vstack([sl_scores_long[k][idx] for k in sl_cands])
        sl_winner = np.argmax(sl_mat, axis=0)
        for j, row_i in enumerate(idx):
            k = sl_cands[sl_winner[j]]
            sl_source[row_i] = k
            sl_best[row_i]   = float(sl_dists_long[k][row_i])
            sl_score_best[row_i] = float(sl_scores_long[k][row_i])

    # SHORT side picks
    if short_mask.any():
        idx = np.where(short_mask)[0]
        tp_cands = ["F127","F161","F200","S1","S2"]
        sl_cands = ["R1","R2","RET236","RET382","RET500","RET618","RET786"]

        tp_mat = np.vstack([tp_scores_short[k][idx] for k in tp_cands])
        tp_winner = np.argmax(tp_mat, axis=0)
        for j, row_i in enumerate(idx):
            k = tp_cands[tp_winner[j]]
            tp_source[row_i] = k
            tp_best[row_i]   = float(tp_dists_short[k][row_i])
            tp_score_best[row_i] = float(tp_scores_short[k][row_i])

        sl_mat = np.vstack([sl_scores_short[k][idx] for k in sl_cands])
        sl_winner = np.argmax(sl_mat, axis=0)
        for j, row_i in enumerate(idx):
            k = sl_cands[sl_winner[j]]
            sl_source[row_i] = k
            sl_best[row_i]   = float(sl_dists_short[k][row_i])
            sl_score_best[row_i] = float(sl_scores_short[k][row_i])

    # Guard rails: clip to reasonable ATR range (same as your earlier bounds)
    tp_best = np.clip(tp_best, 0.8, 3.0)
    sl_best = np.clip(sl_best, 0.5, 1.6)

    out["tp_mult_suggested"] = tp_best
    out["sl_mult_suggested"] = sl_best
    out["tp_source"] = tp_source
    out["sl_source"] = sl_source
    out["tp_score_best"] = tp_score_best
    out["sl_score_best"] = sl_score_best

    return out
