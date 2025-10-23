import numpy as np
import pandas as pd
import talib as ta

def build_indicator_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Ensure float dtype for TA-Lib
    close = df["close"].astype(float).values
    high  = df["high"].astype(float).values
    low   = df["low"].astype(float).values
    vol   = df["volume"].astype(float).values

    # --- basic return ---
    df["price_change"] = pd.Series(close).pct_change()

    # --- normalized volume (safe divide) ---
    vol20 = pd.Series(vol).rolling(20).mean().replace(0, np.nan)
    df["vol_norm"] = (pd.Series(vol) / vol20).fillna(0.0)

    # --- momentums ---
    c = pd.Series(close)
    df["momentum_5"]  = (c - c.shift(5))  / c.shift(5)
    df["momentum_20"] = (c - c.shift(20)) / c.shift(20)

    # --- SMA positions ---
    df["sma10"] = c.rolling(10).mean()
    df["sma20"] = c.rolling(20).mean()
    df["sma10_pos"] = (c - df["sma10"]) / df["sma10"]
    df["sma20_pos"] = (c - df["sma20"]) / df["sma20"]

    # --- RSI normalized 0..1 ---
    rsi = ta.RSI(close, timeperiod=14)
    df["rsi"] = (pd.Series(rsi) / 100.0)

    # --- MACD normalized by price ---
    macd, macd_signal, macd_hist = ta.MACD(close, fastperiod=12, slowperiod=26, signalperiod=9)
    # keep same single-column "macd" like before, normalized by price
    with np.errstate(divide='ignore', invalid='ignore'):
        df["macd"] = pd.Series(macd) / pd.Series(close)
    df["macd"] = df["macd"].replace([np.inf, -np.inf], np.nan)

    # --- volatility (std of returns) ---
    df["volatility"] = df["price_change"].rolling(20).std()

    # --- ATR & normalized ---
    atr = ta.ATR(high, low, close, timeperiod=14)
    df["atr"] = pd.Series(atr)
    with np.errstate(divide='ignore', invalid='ignore'):
        df["atr_norm"] = df["atr"] / pd.Series(close)
    df["atr_norm"] = df["atr_norm"].replace([np.inf, -np.inf], np.nan)

    # --- OBV & normalized ---
    obv = ta.OBV(close, vol)
    df["obv"] = pd.Series(obv)
    vol20_for_obv = pd.Series(vol).rolling(20).mean().replace(0, np.nan)
    df["obv_norm"] = (df["obv"] / vol20_for_obv).fillna(0.0)

    # --- Bollinger position [-1..1] ---
    upper, middle, lower = ta.BBANDS(close, timeperiod=20, nbdevup=2, nbdevdn=2, matype=0)
    upper = pd.Series(upper); lower = pd.Series(lower)
    rng = (upper - lower).replace(0, np.nan)
    df["boll_pos"] = ((pd.Series(close) - lower) / rng) * 2 - 1

    # --- price range ---
    with np.errstate(divide='ignore', invalid='ignore'):
        df["price_range"] = (pd.Series(high) - pd.Series(low)) / pd.Series(close)
    df["price_range"] = df["price_range"].replace([np.inf, -np.inf], np.nan)

    # --- EMA50 distance ---
    ema50 = ta.EMA(close, timeperiod=50)
    df["ema50"] = pd.Series(ema50)
    with np.errstate(divide='ignore', invalid='ignore'):
        df["ema50_pos"] = (pd.Series(close) - df["ema50"]) / df["ema50"]
    df["ema50_pos"] = df["ema50_pos"].replace([np.inf, -np.inf], np.nan)

    # --- ADX normalized ---
    adx = ta.ADX(high, low, close, timeperiod=14)
    df["adx"] = pd.Series(adx) / 100.0

    # --- Market phase flags (uses SMA 50) ---
    ma50 = ta.SMA(close, timeperiod=50)
    df["ma50"] = pd.Series(ma50)
    df["ma50_slope"] = df["ma50"].diff()

    # thresholds kept identical to your original intent
    df["accumulation"] = ((pd.Series(close) < df["ma50"]) & (df["ma50_slope"].abs() < 1e-3)).astype(int)
    df["advancing"]    = ((pd.Series(close) > df["ma50"]) & (df["ma50_slope"] > 0)).astype(int)
    df["distribution"] = ((pd.Series(close) > df["ma50"]) & (df["ma50_slope"] < 0)).astype(int)
    df["declining"]    = ((pd.Series(close) < df["ma50"]) & (df["ma50_slope"] < 0)).astype(int)

    # --- volatility regime 0/1/2 (safe qcut) ---
    try:
        df["vol_regime"] = pd.qcut(df["atr_norm"], q=3, labels=[0,1,2]).astype(int)
    except ValueError:
        # Fallback when not enough unique values
        df["vol_regime"] = 1

    # Final cleanup: replace inf, drop initial NaNs from indicators, reset index
    df.replace([np.inf, -np.inf], np.nan, inplace=True)
    df = df.dropna().reset_index(drop=True)
    return df
