# ===========================================================
#  features_pipeline.py
#  Full feature assembly for PPO training (Crypto / single asset)
#
#  Flow:
#    1) Load  PPO_Models/Crypto/<ASSET>/data/processed.parquet
#    2) build_indicator_features(...)
#    3) compute_fib_features(...)          # True Fib + SR2 (ATR-norm)
#    4) build_entry_meta_features(...)     # interpretation + mislead flags
#    5) build_tp_sl_suggestions(...)       # context-aware TP/SL candidates
#    6) Drop any rows that contain NaN in ANY column (strict)
#    7) Save  PPO_Models/Crypto/<ASSET>/features/features.parquet
#
#  Notes:
#    - Overwrites output every run
#    - Prints progress
#    - No column filtering: everything kept (after dropna())
# ===========================================================

from __future__ import annotations
import os
import sys
import argparse
import pandas as pd

from build_indicator_features import build_indicator_features
from fibo_features import compute_fib_features
from entry_meta_features import build_entry_meta_features
from tp_sl_suggest import build_tp_sl_suggestions

CRYPTO_ROOT = "PPO_Models/Crypto"


def run_features_pipeline(symbol: str) -> None:
    """
    Assemble full features for a single crypto asset (symbol), then save.

    Input :
        PPO_Models/Crypto/<ASSET>/data/processed.parquet
    Output:
        PPO_Models/Crypto/<ASSET>/features/features.parquet
    """
    data_dir = os.path.join(CRYPTO_ROOT, symbol, "data")
    in_path  = os.path.join(data_dir, "processed.parquet")

    if not os.path.exists(in_path):
        raise FileNotFoundError(f"[ERROR] Missing input file: {in_path}")

    print(f"[1] Loading processed.parquet for {symbol} …")
    df = pd.read_parquet(in_path)

    print("[2] Building technical indicators …")
    df = build_indicator_features(df)

    print("[3] Computing Fibonacci + SR2 features …")
    df = compute_fib_features(df)

    print("[4] Building entry meta-features (interpretation + mislead flags) …")
    df = build_entry_meta_features(df)

    print("[5] Suggesting TP/SL candidates …")
    df = build_tp_sl_suggestions(df)

    print("[6] Dropping rows containing any NaN (strict) …")
    before = len(df)
    df = df.dropna().reset_index(drop=True)
    after = len(df)
    dropped = before - after
    print(f"    -> dropped {dropped} rows; final rows = {after}")

    out_dir = os.path.join(CRYPTO_ROOT, symbol, "features")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "features.parquet")

    print(f"[7] Saving features.parquet → {out_path}")
    df.to_parquet(out_path, index=False)

    print(f"[DONE] Features pipeline completed for {symbol}")


# Optional CLI
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run features pipeline for a single crypto asset")
    parser.add_argument("--symbol", required=True, help="e.g., BTCUSDT")
    args = parser.parse_args()
    try:
        run_features_pipeline(args.symbol)
    except Exception as e:
        print(f"[FATAL] {e}", file=sys.stderr)
        sys.exit(1)
