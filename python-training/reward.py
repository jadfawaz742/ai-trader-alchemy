import numpy as np

def reward_function(pnl, atr, conf, tp_dist, sl_dist, sent=0.0, news=0.0):
    """
    pnl      -> realized PnL in price units
    atr      -> ATR at entry
    conf     -> final confidence [-1..1]
    tp_dist  -> ATR * fTP  (actual target distance)
    sl_dist  -> ATR * fSL  (actual stop distance)
    sent     -> sentiment score [-1..1]
    news     -> normalized news intensity [0..1]
    """

    # --- normalize pnl by volatility ---
    pnl_r = pnl / (atr + 1e-9)

    # --- Asymmetric penalty for losses ---
    if pnl_r < 0:
        pnl_r = 1.5 * pnl_r   # make negative more negative

    # --- reward correctness of conviction ---
    conf_r = 0.5 * (conf * np.sign(pnl))

    # --- risk efficiency term (prefers wide TP & tight SL on winners) ---
    eff = 0.2 * (tp_dist / (sl_dist + 1e-9)) * (1 if pnl > 0 else -1)

    # --- no drawdown penalty for now ---
    dd_pen = 0.0

    # --- base raw reward ---
    base = pnl_r + conf_r - 0.3*dd_pen + eff

    # --- apply sentiment/news modifiers (light) ---
    out = base * (1 - 0.2*news) + 0.1*sent*np.sign(pnl)

    # --- stable PPO range ---
    return float(np.clip(out, -3, 3))
