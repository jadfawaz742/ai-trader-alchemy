"""
DATA PIPELINE — STOCKS (15m, ~3 years)

This file handles ONLY data steps for STOCK assets:
  1) Connect to Interactive Brokers TWS/Gateway
  2) Fetch fresh 15m OHLCV from IB (~3 years, respecting data limits)
  3) Preprocess (fill missing candles logically)
  4) Save raw.csv and processed.parquet
  5) No training logic here
  6) Always overwrite existing files
"""

from __future__ import annotations
import os, time
import pandas as pd
from ib_insync import IB, Stock, util
from datetime import datetime, timedelta
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================
# CONFIG — folder root for stocks
# ============================================================
_CURR_DIR = os.path.dirname(os.path.abspath(__file__))
_BASE_DIR = os.path.dirname(_CURR_DIR)
STOCKS_ROOT = os.path.join(_BASE_DIR, "PPO_Models", "Stocks")

# IB Connection settings
IB_HOST = os.getenv("IB_HOST", "127.0.0.1")
IB_PORT = int(os.getenv("IB_PORT", "7497"))  # 7497=TWS paper, 7496=TWS live, 4002=Gateway
IB_CLIENT_ID = int(os.getenv("IB_CLIENT_ID", "1"))


# ============================================================
# STEP 1 — CONNECT TO IB
# ============================================================

def connect_ib(max_retries: int = 5, sleep_sec: float = 2.0) -> IB:
    """
    Connect to Interactive Brokers TWS or Gateway.
    Retries on failure with exponential backoff.
    """
    ib = IB()
    last_err = None
    
    for attempt in range(max_retries):
        try:
            logger.info(f"[IB] Connecting to {IB_HOST}:{IB_PORT} (attempt {attempt+1}/{max_retries})...")
            ib.connect(IB_HOST, IB_PORT, clientId=IB_CLIENT_ID, timeout=20)
            logger.info(f"[IB] ✅ Connected successfully!")
            return ib
        except Exception as e:
            last_err = e
            logger.warning(f"[IB] Connection failed: {e}")
            if attempt < max_retries - 1:
                sleep_time = sleep_sec * (2 ** attempt)
                logger.info(f"[IB] Retrying in {sleep_time}s...")
                time.sleep(sleep_time)
    
    raise RuntimeError(f"Failed to connect to IB after {max_retries} attempts: {last_err}")


# ============================================================
# STEP 2 — FETCH 15m BARS (~3 years)
# ============================================================

def fetch_stock_bars_15m(
    symbol: str,
    exchange: str = "SMART",
    currency: str = "USD",
    duration: str = "3 Y",
    bar_size: str = "15 mins",
    max_retries: int = 3
) -> pd.DataFrame:
    """
    Fetch 15-minute historical bars from Interactive Brokers.
    
    IB limits:
    - Max ~1-2 years of 15-min bars per request (depends on subscription)
    - May need pagination for full 3 years
    
    Args:
        symbol: Stock ticker (e.g., 'AAPL', 'TSLA')
        exchange: Trading venue (default 'SMART' for best routing)
        currency: Currency (default 'USD')
        duration: How far back (e.g., '3 Y', '2 Y', '1 M')
        bar_size: Bar interval (must be valid IB bar size: '15 mins')
    
    Returns:
        DataFrame with columns: date, open, high, low, close, volume
    """
    ib = connect_ib()
    
    try:
        # Create stock contract
        contract = Stock(symbol, exchange, currency)
        ib.qualifyContracts(contract)
        logger.info(f"[IB] Contract qualified: {contract}")
        
        # Request historical data
        logger.info(f"[IB] Requesting {duration} of {bar_size} bars for {symbol}...")
        bars = []
        last_err = None
        
        for attempt in range(max_retries):
            try:
                bars = ib.reqHistoricalData(
                    contract,
                    endDateTime='',  # Empty = now
                    durationStr=duration,
                    barSizeSetting=bar_size,
                    whatToShow='TRADES',
                    useRTH=False,  # Include extended hours
                    formatDate=1,  # String format
                    keepUpToDate=False
                )
                
                if bars:
                    break
                    
            except Exception as e:
                last_err = e
                logger.warning(f"[IB] Request failed (attempt {attempt+1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    time.sleep(2)
        
        if not bars:
            raise RuntimeError(f"No data returned for {symbol}: {last_err}")
        
        logger.info(f"[IB] ✅ Received {len(bars)} bars")
        
        # Convert to DataFrame
        df = util.df(bars)
        
        # Rename columns to match crypto format
        df = df.rename(columns={
            'date': 'close_time',
            'open': 'open',
            'high': 'high',
            'low': 'low',
            'close': 'close',
            'volume': 'volume'
        })
        
        # Keep only essential columns
        df = df[['close_time', 'open', 'high', 'low', 'close', 'volume']]
        
        # Parse datetime
        df['close_time'] = pd.to_datetime(df['close_time'], utc=True)
        df['open_time'] = df['close_time'] - pd.Timedelta(minutes=15)
        
        # Ensure numeric types
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = df[col].astype(float)
        
        df = df.sort_values('close_time').reset_index(drop=True)
        
        logger.info(f"[IB] Data range: {df['close_time'].iloc[0]} to {df['close_time'].iloc[-1]}")
        
        return df
        
    finally:
        ib.disconnect()
        logger.info("[IB] Disconnected")


# ============================================================
# STEP 3 — PREPROCESS (reindex + logical fill)
# ============================================================

def preprocess_ohlcv_15m(df_raw: pd.DataFrame) -> pd.DataFrame:
    """
    Reindex to full continuous 15m timeline and fill missing candles logically.
    Uses same logic as crypto preprocessing for consistency.
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
# STEP 4 — SAVE HELPERS (overwrite = always)
# ============================================================

def _ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)

def save_raw(df: pd.DataFrame, symbol: str):
    """
    Save raw data as raw.csv under:
      PPO_Models/Stocks/<SYMBOL>/data/raw.csv
    Always overwrite.
    """
    folder = os.path.join(STOCKS_ROOT, symbol, "data")
    _ensure_dir(folder)
    path = os.path.join(folder, "raw.csv")
    df.to_csv(path, index=False)
    logger.info(f"[SAVE] Written {path}")

def save_processed(df: pd.DataFrame, symbol: str):
    """
    Save processed data as processed.parquet under:
      PPO_Models/Stocks/<SYMBOL>/data/processed.parquet
    Always overwrite.
    """
    folder = os.path.join(STOCKS_ROOT, symbol, "data")
    _ensure_dir(folder)
    path = os.path.join(folder, "processed.parquet")
    df.to_parquet(path, index=False)
    logger.info(f"[SAVE] Written {path}")


# ============================================================
# STEP 5 — ORCHESTRATOR
# ============================================================

def build_stock_dataset(symbol: str, exchange: str = "SMART", currency: str = "USD"):
    """
    MASTER FUNCTION — runs the full pipeline and saves results.
    - symbol: Stock ticker (e.g., 'AAPL', 'TSLA', 'GOOGL')
    - exchange: Trading venue (default 'SMART')
    - currency: Currency (default 'USD')
    - no return, just saves to disk
    """
    logger.info(f"[START] Building stock dataset for {symbol}")
    logger.info(f"        Exchange: {exchange}, Currency: {currency}")
    
    logger.info(f"[FETCH] Fetching ~3y 15m bars from IB for {symbol} ...")
    df_raw = fetch_stock_bars_15m(symbol, exchange=exchange, currency=currency)

    logger.info("[SAVE] Writing raw.csv ...")
    save_raw(df_raw, symbol)

    logger.info("[PREP] Preprocessing (reindex + fill) ...")
    df_prep = preprocess_ohlcv_15m(df_raw)

    logger.info("[SAVE] Writing processed.parquet ...")
    save_processed(df_prep, symbol)

    logger.info(f"[DONE] ✅ Data pipeline completed for {symbol}")
    logger.info(f"       Saved to: {STOCKS_ROOT}/{symbol}/data/")


# ============================================================
# CLI INTERFACE
# ============================================================

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Fetch and prepare stock data from Interactive Brokers")
    parser.add_argument("--symbol", required=True, help="Stock ticker (e.g., AAPL, TSLA)")
    parser.add_argument("--exchange", default="SMART", help="Exchange (default: SMART)")
    parser.add_argument("--currency", default="USD", help="Currency (default: USD)")
    
    args = parser.parse_args()
    
    try:
        build_stock_dataset(args.symbol, exchange=args.exchange, currency=args.currency)
    except Exception as e:
        logger.error(f"[FATAL] {e}")
        import sys
        sys.exit(1)
