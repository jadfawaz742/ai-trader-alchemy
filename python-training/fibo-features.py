# ===========================================================
#  TRUE FIBONACCI + SR2 FEATURES — ZIGZAG-ABC with ATR×3
#  (ATR-normalized distances, no NaN remain)
# ===========================================================

import numpy as np
import pandas as pd

FIB_FEATURE_COLS = [
    "fib_ext_127","fib_ext_161","fib_ext_200",
    "fib_ret_236","fib_ret_382","fib_ret_500","fib_ret_618","fib_ret_786",
]

SR_FEATURE_COLS = [
    "sr_support_1_dist","sr_support_2_dist",
    "sr_resistance_1_dist","sr_resistance_2_dist",
]

def _safe_div(x, y):
    return np.nan if (y is None or y == 0) else (x / y)

def _update_pivot(direction, last_pivot_price, c, rev):
    reversed_flag = False
    new_type = None
    if direction == 0:
        return 0, c, None, False
    if direction >= 0:
        if c > last_pivot_price:
            last_pivot_price = c
            direction = +1
        elif (last_pivot_price - c) > rev:
            reversed_flag = True
            new_type = 'H'
            direction = -1
            last_pivot_price = c
    else:
        if c < last_pivot_price:
            last_pivot_price = c
            direction = -1
        elif (c - last_pivot_price) > rev:
            reversed_flag = True
            new_type = 'L'
            direction = +1
            last_pivot_price = c
    return direction, last_pivot_price, new_type, reversed_flag

def _form_abc(piv_types, piv_prices):
    if len(piv_types) < 3:
        return None
    A_type,B_type,C_type = piv_types[-3:]
    A,B,C = piv_prices[-3:]
    return (A_type,A,B_type,B,C_type,C)

def compute_fib_features(df: pd.DataFrame, atr_mult: float = 3.0) -> pd.DataFrame:
    df = df.copy()
    n = len(df)

    # prepare columns
    for c in FIB_FEATURE_COLS + SR_FEATURE_COLS:
        df[c] = np.nan

    piv_types, piv_prices = [], []
    direction = 0
    last_pivot_price = df["close"].iloc[0]

    for i in range(n):
        c = df["close"].iloc[i]
        a = df["atr"].iloc[i] if df["atr"].iloc[i] > 0 else (df["atr"].iloc[i-1] if i > 0 else 1e-6)
        rev = atr_mult * a

        # --- UPDATE PIVOTS ---
        direction, last_pivot_price, new_type, rev_flag = _update_pivot(direction, last_pivot_price, c, rev)
        if rev_flag and new_type is not None:
            if not piv_types or piv_types[-1] != new_type:
                piv_types.append(new_type)
                piv_prices.append(last_pivot_price)
            else:
                piv_types[-1]  = new_type
                piv_prices[-1] = last_pivot_price

        # --- SR2 (every bar, same pivots) ---
        if piv_prices:
            lv = sorted(set(piv_prices))
            sup = [x for x in lv if x < c]
            res = [x for x in lv if x > c]
            sup = sorted(sup, key=lambda x: c-x)
            res = sorted(res, key=lambda x: x-c)

            df.at[i,"sr_support_1_dist"]    = _safe_div(c - sup[0], a) if len(sup)>=1 else np.nan
            df.at[i,"sr_support_2_dist"]    = _safe_div(c - sup[1], a) if len(sup)>=2 else np.nan
            df.at[i,"sr_resistance_1_dist"] = _safe_div(res[0] - c, a) if len(res)>=1 else np.nan
            df.at[i,"sr_resistance_2_dist"] = _safe_div(res[1] - c, a) if len(res)>=2 else np.nan

        # --- FIB only after ABC ---
        ABC = _form_abc(piv_types, piv_prices)
        if ABC is None: continue
        A_type,A,B_type,B,C_type,C = ABC
        R = abs(B-A)
        if R <= 0: continue

        if A_type=='L' and B_type=='H' and C_type=='L':
            ext127 = C + R*1.272; ext161 = C + R*1.618; ext200 = C + R*2
            ret236 = B - R*0.236; ret382 = B - R*0.382; ret500 = B - R*0.5
            ret618 = B - R*0.618; ret786 = B - R*0.786
        elif A_type=='H' and B_type=='L' and C_type=='H':
            ext127 = C - R*1.272; ext161 = C - R*1.618; ext200 = C - R*2
            ret236 = B + R*0.236; ret382 = B + R*0.382; ret500 = B + R*0.5
            ret618 = B + R*0.618; ret786 = B + R*0.786
        else: continue

        df.at[i,"fib_ext_127"] = _safe_div(ext127 - c,a)
        df.at[i,"fib_ext_161"] = _safe_div(ext161 - c,a)
        df.at[i,"fib_ext_200"] = _safe_div(ext200 - c,a)
        df.at[i,"fib_ret_236"] = _safe_div(c - ret236,a)
        df.at[i,"fib_ret_382"] = _safe_div(c - ret382,a)
        df.at[i,"fib_ret_500"] = _safe_div(c - ret500,a)
        df.at[i,"fib_ret_618"] = _safe_div(c - ret618,a)
        df.at[i,"fib_ret_786"] = _safe_div(c - ret786,a)

    # fill & clip
    all_cols = FIB_FEATURE_COLS + SR_FEATURE_COLS
    df[all_cols] = df[all_cols].ffill().fillna(0).clip(-50,50)
    return df
