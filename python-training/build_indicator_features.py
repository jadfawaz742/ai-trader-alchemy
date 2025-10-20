import numpy as np
import pandas as pd
import pandas_ta as ta

def build_indicator_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # --- basic return ---
    df["price_change"] = df["close"].pct_change()

    # --- normalized volume ---
    df["vol_norm"] = df["volume"] / df["volume"].rolling(20).mean()

    # --- momentums ---
    df["momentum_5"]  = (df["close"] - df["close"].shift(5))  / df["close"].shift(5)
    df["momentum_20"] = (df["close"] - df["close"].shift(20)) / df["close"].shift(20)

    # --- SMA positions ---
    df["sma10"] = df["close"].rolling(10).mean()
    df["sma20"] = df["close"].rolling(20).mean()
    df["sma10_pos"] = (df["close"] - df["sma10"]) / df["sma10"]
    df["sma20_pos"] = (df["close"] - df["sma20"]) / df["sma20"]

    # --- RSI normalized 0..1 ---
    df["rsi"] = ta.rsi(df["close"], length=14) / 100.0

    # --- MACD normalized by price ---
    macd = ta.macd(df["close"], fast=12, slow=26)
    df["macd"] = macd["MACD_12_26_9"] / df["close"]

    # --- volatility (std of returns) ---
    df["volatility"] = df["price_change"].rolling(20).std()

    # --- ATR normalized ---
    df["atr"] = ta.atr(df["high"], df["low"], df["close"], length=14)
    df["atr_norm"] = df["atr"] / df["close"]

    # --- OBV normalized ---
    df["obv"] = ta.obv(df["close"], df["volume"])
    df["obv_norm"] = df["obv"] / df["volume"].rolling(20).mean()

    # --- Bollinger position [-1..1] ---
    bb = ta.bbands(df["close"], length=20, std=2)
    rng = (bb["BBU_20_2.0"] - bb["BBL_20_2.0"]).replace(0, np.nan)
    df["boll_pos"] = ((df["close"] - bb["BBL_20_2.0"]) / rng) * 2 - 1

    # --- price range ---
    df["price_range"] = (df["high"] - df["low"]) / df["close"]

    # --- EMA50 distance ---
    df["ema50"] = ta.ema(df["close"], length=50)
    df["ema50_pos"] = (df["close"] - df["ema50"]) / df["ema50"]

    # --- ADX normalized ---
    df["adx"] = ta.adx(df["high"], df["low"], df["close"], length=14)["ADX_14"] / 100.0

    # --- Market phase flags ---
    df["ma50"] = ta.sma(df["close"], length=50)
    df["ma50_slope"] = df["ma50"].diff()

    df["accumulation"] = ((df["close"] < df["ma50"]) & (df["ma50_slope"].abs() < 1e-3)).astype(int)
    df["advancing"]    = ((df["close"] > df["ma50"]) & (df["ma50_slope"] > 0)).astype(int)
    df["distribution"] = ((df["close"] > df["ma50"]) & (df["ma50_slope"] < 0)).astype(int)
    df["declining"]    = ((df["close"] < df["ma50"]) & (df["ma50_slope"] < 0)).astype(int)

    # --- volatility regime 0/1/2 ---
    df["vol_regime"] = pd.qcut(df["atr_norm"], q=3, labels=[0,1,2]).astype(int)

    # Drop NaN at the beginning
    return df.dropna().reset_index(drop=True)
