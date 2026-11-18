"""ICT (Inner Circle Trader) concepts, computed bar by bar with no look-ahead.

Columns produced (one row per candle):
  swing_high / swing_low   last *confirmed* swing high/low price (dealing range)
  ms_trend                 market structure: +1 bullish, -1 bearish, 0 unknown
  bos                      +1/-1 on the candle that closes beyond a swing (continuation)
  choch                    +1/-1 Change of Character / Market Structure Shift (reversal)
  break_level              price level broken by the BOS/CHoCH
  sweep                    +1 sell-side liquidity swept (wick below old low, close back above)
                           -1 buy-side liquidity swept (wick above old high, close back below)
  sweep_level              the liquidity level that was taken
  fvg_new                  +1/-1 a new Fair Value Gap formed on this candle
  fvg_bias                 direction of the most recent unfilled FVG
  fvg_react                +1/-1 price returned into an FVG and rejected it
  ob_react                 +1/-1 price returned into an Order Block and rejected it
  pd_pos                   position in dealing range: 0 = swing low, 1 = swing high
                           (<0.5 discount = favour buys, >0.5 premium = favour sells)
  killzone                 "London" / "NY AM" / "NY PM" / "Asia" / ""  (New York time)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .indicators import atr as _atr


def killzone(ts: pd.Timestamp) -> str:
    ny = ts.tz_convert("America/New_York") if ts.tzinfo else ts.tz_localize("UTC").tz_convert("America/New_York")
    m = ny.hour * 60 + ny.minute
    if 120 <= m < 300:
        return "London"
    if 420 <= m < 600:
        return "NY AM"
    if 810 <= m < 960:
        return "NY PM"
    if m >= 1200:
        return "Asia"
    return ""


def compute(df: pd.DataFrame, k: int = 3, min_fvg_atr: float = 0.1, liquidity_pools: int = 5,
            zone_life: int = 100) -> pd.DataFrame:
    o, h, l, c = (df[x].to_numpy(float) for x in ("open", "high", "low", "close"))
    a = df["atr"].to_numpy(float) if "atr" in df else _atr(df).to_numpy(float)
    n = len(df)

    cols = {name: np.zeros(n) for name in ("ms_trend", "bos", "choch", "sweep", "fvg_new", "fvg_bias", "fvg_react", "ob_react")}
    for name in ("swing_high", "swing_low", "break_level", "sweep_level", "pd_pos"):
        cols[name] = np.full(n, np.nan)

    trend = 0
    sh = sl = None            # (price, index) of last confirmed swing high / low
    sh_broken = sl_broken = False
    highs_pool, lows_pool = [], []   # untaken liquidity levels
    fvgs = []                 # dicts: dir, top, bottom, born
    obs = []                  # dicts: dir, top, bottom, born
    fvg_bias = 0

    for i in range(n):
        # 1) confirm the pivot k bars ago (uses only bars <= i)
        j = i - k
        if j >= k:
            if h[j] == h[j - k : i + 1].max():
                sh, sh_broken = (h[j], j), False
                highs_pool = (highs_pool + [h[j]])[-liquidity_pools:]
            if l[j] == l[j - k : i + 1].min():
                sl, sl_broken = (l[j], j), False
                lows_pool = (lows_pool + [l[j]])[-liquidity_pools:]

        # 2) liquidity sweeps: wick through an old level, close back inside
        taken_low = [p for p in lows_pool if l[i] < p]
        if taken_low:
            lvl = min(taken_low)
            if c[i] > max(taken_low):
                cols["sweep"][i], cols["sweep_level"][i] = 1, lvl
            lows_pool = [p for p in lows_pool if p not in taken_low]
        taken_high = [p for p in highs_pool if h[i] > p]
        if taken_high:
            lvl = max(taken_high)
            if c[i] < min(taken_high):
                cols["sweep"][i], cols["sweep_level"][i] = -1, lvl
            highs_pool = [p for p in highs_pool if p not in taken_high]

        # 3) structure breaks (candle CLOSE beyond the swing)
        if sh and not sh_broken and c[i] > sh[0]:
            key = "choch" if trend == -1 else "bos"
            cols[key][i], cols["break_level"][i] = 1, sh[0]
            trend, sh_broken = 1, True
            start = sl[1] if sl else max(0, i - 30)
            for t in range(i - 1, max(start, i - 30) - 1, -1):   # last down candle = bullish OB
                if c[t] < o[t]:
                    obs.append({"dir": 1, "top": h[t], "bottom": l[t], "born": i})
                    break
        if sl and not sl_broken and c[i] < sl[0]:
            key = "choch" if trend == 1 else "bos"
            cols[key][i], cols["break_level"][i] = -1, sl[0]
            trend, sl_broken = -1, True
            start = sh[1] if sh else max(0, i - 30)
            for t in range(i - 1, max(start, i - 30) - 1, -1):   # last up candle = bearish OB
                if c[t] > o[t]:
                    obs.append({"dir": -1, "top": h[t], "bottom": l[t], "born": i})
                    break

        # 4) reactions to existing FVGs / OBs (zones born before this candle)
        for zones, col in ((fvgs, "fvg_react"), (obs, "ob_react")):
            keep = []
            for z in zones:
                if z["born"] >= i:
                    keep.append(z)
                    continue
                if i - z["born"] > zone_life:
                    continue
                if z["dir"] == 1:
                    if c[i] < z["bottom"]:
                        continue                      # invalidated
                    if l[i] <= z["top"] and c[i] > o[i]:
                        cols[col][i] = 1              # tapped and rejected -> mitigated
                        continue
                else:
                    if c[i] > z["top"]:
                        continue
                    if h[i] >= z["bottom"] and c[i] < o[i]:
                        cols[col][i] = -1
                        continue
                keep.append(z)
            zones[:] = keep

        # 5) new fair value gaps (3-candle imbalance)
        if i >= 2 and not np.isnan(a[i]):
            if l[i] > h[i - 2] and l[i] - h[i - 2] >= min_fvg_atr * a[i]:
                fvgs.append({"dir": 1, "top": l[i], "bottom": h[i - 2], "born": i})
                cols["fvg_new"][i], fvg_bias = 1, 1
            elif h[i] < l[i - 2] and l[i - 2] - h[i] >= min_fvg_atr * a[i]:
                fvgs.append({"dir": -1, "top": l[i - 2], "bottom": h[i], "born": i})
                cols["fvg_new"][i], fvg_bias = -1, -1

        cols["ms_trend"][i] = trend
        cols["fvg_bias"][i] = fvg_bias
        if sh:
            cols["swing_high"][i] = sh[0]
        if sl:
            cols["swing_low"][i] = sl[0]
        if sh and sl and sh[0] > sl[0]:
            cols["pd_pos"][i] = (c[i] - sl[0]) / (sh[0] - sl[0])

    out = pd.DataFrame(cols, index=df.index)
    out["killzone"] = [killzone(t) for t in df.index]
    return out


def pd_label(pos: float) -> str:
    if pos is None or np.isnan(pos):
        return "n/a"
    if pos < 0.5:
        return "Discount" + (" (OTE)" if 0.21 <= pos <= 0.38 else "")
    return "Premium" + (" (OTE)" if 0.62 <= pos <= 0.79 else "")
