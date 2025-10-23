"""
DATA PIPELINE — CRYPTO (15m, ~3 years)

This file handles ONLY data steps for CRYPTO assets:
  1) Fetch fresh 15m OHLCV from Binance (~3 years)
  2) Preprocess (fill missing candles logically)
  3) Save raw.csv and processed.parquet
  4) No training logic here
  5) Always overwrite existing files
"""

from __future__ import annotations
import os, time
import pandas as pd
from binance.client import Client
from binance.exceptions import BinanceAPIException, BinanceRequestException


# ============================================================
# CONFIG — folder root for crypto
# ============================================================

_CURR_DIR = os.path.dirname(os.path.abspath(__file__))
# go one level up to project root
_BASE_DIR = os.path.dirname(_CURR_DIR)

CRYPTO_ROOT = os.path.join(_BASE_DIR, "PPO_Models", "Cryptocurrencies")



# ============================================================
# STEP 1 — FETCH 15m OHLCV (~3 years)
# ============================================================

def _make_binance_client() -> Client:
    """
    Build Binance client.
    API keys not required for public klines, but using .env keys improves rate limits.
    """
    api_key = os.getenv("BINANCE_API_KEY") or None
    api_secret = os.getenv("BINANCE_API_SECRET") or None
    return Client(api_key, api_secret)


def fetch_klines_15m_3y(symbol: str,
                        interval: str = "15m",
                        start_str: str = "3 years ago UTC",
                        max_retries: int = 5,
                        sleep_sec: float = 1.5) -> pd.DataFrame:
    """
    Always fetch fresh ~3y 15m OHLCV from Binance for this symbol.
    """
    client = _make_binance_client()
    last_err = None

    for _ in range(max_retries):
        try:
            raw = client.get_historical_klines(symbol, interval, start_str=start_str)
            break
        except (BinanceAPIException, BinanceRequestException, Exception) as e:
            last_err = e
            time.sleep(sleep_sec)
    else:
        raise RuntimeError(f"Failed to fetch {symbol} klines after {max_retries} attempts: {last_err}")

    cols_all = [
        "open_time","open","high","low","close","volume",
        "close_time","quote_asset_volume","number_of_trades",
        "taker_buy_base","taker_buy_quote","ignore"
    ]
    df = pd.DataFrame(raw, columns=cols_all)
    if df.empty:
        raise RuntimeError(f"No klines returned for {symbol}")

    # Keep essentials
    df = df[["open_time","open","high","low","close","volume","close_time"]]

    # Parse types
    df["open_time"]  = pd.to_datetime(df["open_time"], unit="ms", utc=True)
    df["close_time"] = pd.to_datetime(df["close_time"], unit="ms", utc=True)
    for c in ["open","high","low","close","volume"]:
        df[c] = df[c].astype(float)

    df = df.sort_values("close_time").reset_index(drop=True)
    return df



# ============================================================
# STEP 2 — PREPROCESS (reindex + logical fill)
# ============================================================

def preprocess_ohlcv_15m(df_raw: pd.DataFrame) -> pd.DataFrame:
    """
    Reindex to full continuous 15m timeline and fill missing candles logically.
    """
    df = df_raw.copy().sort_values("close_time").reset_index(drop=True)

    full_index = pd.date_range(
        start=df["close_time"].iloc[0],
        end=df["close_time"].iloc[-1],
        freq="15min",
        tz="UTC"
    )

    # set close_time as index to reindex
    df = df.set_index("close_time").reindex(full_index)

    # recreate time columns
    df["close_time"] = df.index
    df["open_time"]  = df["close_time"] - pd.Timedelta(minutes=15)

    # forward-fill close price
    df["close"] = df["close"].ffill()

    # fill missing OHLC with last close
    df["open"]  = df["open"].fillna(df["close"])
    df["high"]  = df["high"].fillna(df["close"])
    df["low"]   = df["low"].fillna(df["close"])

    # fill volume with zero for synthetic bars
    df["volume"] = df["volume"].fillna(0.0)

    # enforce dtype
    for c in ["open","high","low","close","volume"]:
        df[c] = df[c].astype(float)

    df = df.reset_index(drop=True)
    return df



# ============================================================
# STEP 3 — SAVE HELPERS (overwrite = always)
# ============================================================

def _ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)

def save_raw(df: pd.DataFrame, asset: str):
    """
    Save raw data as raw.csv under:
      PPO_Models/Crypto/<ASSET>/data/raw.csv
    Always overwrite.
    """
    folder = os.path.join(CRYPTO_ROOT, asset, "data")
    _ensure_dir(folder)
    df.to_csv(os.path.join(folder, "raw.csv"), index=False)

def save_processed(df: pd.DataFrame, asset: str):
    """
    Save processed data as processed.parquet under:
      PPO_Models/Crypto/<ASSET>/data/processed.parquet
    Always overwrite.
    """
    folder = os.path.join(CRYPTO_ROOT, asset, "data")
    _ensure_dir(folder)
    df.to_parquet(os.path.join(folder, "processed.parquet"), index=False)



# ============================================================
# STEP 4 — ORCHESTRATOR
# ============================================================

def build_crypto_dataset(symbol: str):
    """
    MASTER FUNCTION — runs the full pipeline and saves results.
    - symbol must be full Binance pair, e.g. 'BTCUSDT'
    - no return, just saves to disk
    """
    print(f"[FETCH] Fetching ~3y 15m klines for {symbol} ...")
    df_raw = fetch_klines_15m_3y(symbol)

    print("[SAVE] Writing raw.csv ...")
    save_raw(df_raw, symbol)

    print("[PREP] Preprocessing (reindex + fill) ...")
    df_prep = preprocess_ohlcv_15m(df_raw)

    print("[SAVE] Writing processed.parquet ...")
    save_processed(df_prep, symbol)

    print(f"[DONE] Data pipeline completed for {symbol}")
