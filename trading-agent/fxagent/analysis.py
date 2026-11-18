"""Trend scoring and turning-point (reversal) detection."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from . import ict, indicators, patterns


@dataclass
class Analysis:
    symbol: str
    timeframe: str
    time: pd.Timestamp
    price: float
    score: float                       # -100 (strong bearish) .. +100 (strong bullish)
    trend: str                         # BULLISH / BEARISH / NEUTRAL
    strength: str                      # weak / moderate / strong
    components: dict = field(default_factory=dict)
    indicators: dict = field(default_factory=dict)
    candles: list = field(default_factory=list)
    higher_tf_trend: str | None = None
    signal: "Signal | None" = None


@dataclass
class Signal:
    direction: str                     # BUY (bullish turn) / SELL (bearish turn)
    confluence: int
    reasons: list
    entry: float
    stop_loss: float
    take_profit_1: float
    take_profit_2: float
    confidence: str                    # high / medium / low from track record, or "unrated"
    time: pd.Timestamp = None
    notes: list = field(default_factory=list)      # context, not counted as confluence
    liquidity_target: float | None = None          # ICT draw on liquidity (opposite swing)
    track_record: dict | None = None               # backtest stats for this symbol/timeframe

    @property
    def key(self) -> str:
        return f"{self.direction}@{self.time.isoformat()}"


def _f(x: float) -> str:
    return f"{x:,.2f}" if abs(x) >= 100 else f"{x:.5f}"


def _clip(x: float, lo: float = -1.0, hi: float = 1.0) -> float:
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return 0.0
    return float(max(lo, min(hi, x)))


DEFAULT_WEIGHTS = {
    "ema_trend": 25,
    "macd": 20,
    "rsi": 15,
    "cci": 10,
    "adx_di": 15,
    "volume": 10,
    "candles": 5,
    "ict": 20,
}


def prepare(df: pd.DataFrame, cfg: dict | None = None) -> pd.DataFrame:
    """Add all indicators + candlestick patterns."""
    cfg = cfg or {}
    out = indicators.add_all(df, cfg.get("indicators"))
    ic = cfg.get("ict", {})
    if ic.get("enabled", True):
        out = out.join(ict.compute(out, k=ic.get("swing_k", 3), min_fvg_atr=ic.get("min_fvg_atr", 0.1)))
    return out.join(patterns.detect(out))


def score_row(d: pd.DataFrame, i: int, weights: dict | None = None) -> tuple[float, dict]:
    """Score bar i of a prepared frame. Returns (score -100..100, components)."""
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    r = d.iloc[i]
    p = d.iloc[i - 1]
    comp = {}

    # 1. EMA alignment: price vs EMAs and EMA stacking
    comp["ema_trend"] = (
        np.sign(r.close - r.ema_mid) * 0.35
        + np.sign(r.ema_fast - r.ema_mid) * 0.35
        + np.sign(r.ema_mid - r.ema_slow) * 0.30
    )
    # 2. MACD: side of signal line + histogram momentum + side of zero
    hist_slope = np.sign(r.macd_hist - p.macd_hist)
    comp["macd"] = _clip(np.sign(r.macd_hist) * 0.5 + hist_slope * 0.25 + np.sign(r.macd) * 0.25)
    # 3. RSI: distance from 50, scaled (70 -> +1, 30 -> -1)
    comp["rsi"] = _clip((r.rsi - 50) / 20)
    # 4. CCI: +/-200 maps to +/-1
    comp["cci"] = _clip(r.cci / 200)
    # 5. ADX/DI: direction from DI, magnitude from ADX (25+ = trending)
    di = np.sign(r.plus_di - r.minus_di)
    comp["adx_di"] = _clip(di * min(r.adx / 35, 1.0)) if not np.isnan(r.adx) else 0.0
    # 6. Volume: high relative volume confirms the candle direction; OBV slope
    if not np.isnan(r.vol_ratio):
        candle_dir = np.sign(r.close - r.open)
        vol_conf = candle_dir * _clip((r.vol_ratio - 1.0), 0, 1)
        comp["volume"] = _clip(vol_conf * 0.6 + np.sign(r.obv_slope) * 0.4)
    else:
        comp["volume"] = None  # excluded (no volume data, e.g. spot FX)
    # 7. Candlestick patterns on this bar
    cs = r.engulfing + r.star3 + 0.5 * r.hammer_star
    comp["candles"] = _clip(cs)
    # 8. ICT: market structure direction + bias of the latest unfilled FVG
    if "ms_trend" in d:
        comp["ict"] = _clip(0.7 * r.ms_trend + 0.3 * r.fvg_bias)

    total_w = sum(w[k] for k, v in comp.items() if v is not None)
    score = sum(w[k] * v for k, v in comp.items() if v is not None) / total_w * 100
    return float(score), {k: (None if v is None else round(float(v), 2)) for k, v in comp.items()}


def classify(score: float, threshold: float = 25) -> tuple[str, str]:
    trend = "BULLISH" if score >= threshold else "BEARISH" if score <= -threshold else "NEUTRAL"
    a = abs(score)
    strength = "strong" if a >= 60 else "moderate" if a >= threshold else "weak"
    return trend, strength


def _pivots(s: pd.Series, k: int = 3, kind: str = "low") -> list[int]:
    """Positional indices of swing lows/highs confirmed by k bars on both sides."""
    v = s.values
    idx = []
    for i in range(k, len(v) - k):
        win = v[i - k : i + k + 1]
        if np.isnan(win).any():
            continue
        if kind == "low" and v[i] == win.min():
            idx.append(i)
        elif kind == "high" and v[i] == win.max():
            idx.append(i)
    return idx


def divergence(d: pd.DataFrame, i: int, lookback: int = 40, k: int = 3, recent: int = 6) -> int:
    """RSI divergence ending near bar i. +1 bullish, -1 bearish, 0 none."""
    lo = max(0, i - lookback)
    seg = d.iloc[lo : i + 1]
    lows = _pivots(seg["low"], k, "low")
    highs = _pivots(seg["high"], k, "high")
    n = len(seg) - 1
    if len(lows) >= 2 and n - lows[-1] <= recent:
        a, b = lows[-2], lows[-1]
        if seg["low"].iloc[b] < seg["low"].iloc[a] and seg["rsi"].iloc[b] > seg["rsi"].iloc[a]:
            return 1
    if len(highs) >= 2 and n - highs[-1] <= recent:
        a, b = highs[-2], highs[-1]
        if seg["high"].iloc[b] > seg["high"].iloc[a] and seg["rsi"].iloc[b] < seg["rsi"].iloc[a]:
            return -1
    return 0


def turning_point(d: pd.DataFrame, i: int, cfg: dict | None = None) -> Signal | None:
    """Look for a bullish or bearish reversal at bar i using indicator confluence."""
    c = (cfg or {}).get("signals", {})
    min_conf = c.get("min_confluence", 4)
    look = c.get("recent_bars", 3)  # how many bars back an event can count
    r = d.iloc[i]
    win = d.iloc[max(0, i - look) : i + 1]
    prev = d.iloc[max(0, i - look - 1) : i]

    def crossed_up(a: str, level) -> bool:
        lv = win[level] if isinstance(level, str) else level
        lp = prev[level] if isinstance(level, str) else level
        return bool(((win[a].values > np.asarray(lv)) & (prev[a].values <= np.asarray(lp))).any()) if len(prev) == len(win) else False

    def crossed_down(a: str, level) -> bool:
        lv = win[level] if isinstance(level, str) else level
        lp = prev[level] if isinstance(level, str) else level
        return bool(((win[a].values < np.asarray(lv)) & (prev[a].values >= np.asarray(lp))).any()) if len(prev) == len(win) else False

    div = divergence(d, i, k=c.get("pivot_k", 3))

    bull, bear = [], []
    # RSI leaving oversold / overbought
    if crossed_up("rsi", 30):
        bull.append("RSI crossed back above 30 (leaving oversold)")
    if crossed_down("rsi", 70):
        bear.append("RSI crossed back below 70 (leaving overbought)")
    # MACD signal-line crossover (stronger when on the 'wrong' side of zero)
    if crossed_up("macd", "macd_signal"):
        bull.append("MACD bullish crossover" + (" below zero" if r.macd < 0 else ""))
    if crossed_down("macd", "macd_signal"):
        bear.append("MACD bearish crossover" + (" above zero" if r.macd > 0 else ""))
    # CCI leaving extremes
    if crossed_up("cci", -100):
        bull.append("CCI crossed up through -100")
    if crossed_down("cci", 100):
        bear.append("CCI crossed down through +100")
    # Divergence
    if div > 0:
        bull.append("Bullish RSI divergence (lower low in price, higher low in RSI)")
    elif div < 0:
        bear.append("Bearish RSI divergence (higher high in price, lower high in RSI)")
    # Reversal candles in context (near lower/upper Bollinger band or RSI extreme)
    near_low = (win["low"] <= win["bb_low"]).any() or win["rsi"].min() < 35
    near_high = (win["high"] >= win["bb_up"]).any() or win["rsi"].max() > 65
    for name, dirn in patterns.describe(r):
        if dirn > 0 and near_low and name != "Shooting Star":
            bull.append(f"{name} candle at support / oversold area")
        if dirn < 0 and near_high and name != "Hammer":
            bear.append(f"{name} candle at resistance / overbought area")
    if r.hammer_star < 0 and near_low:  # inverted hammer after decline
        bull.append("Inverted hammer after decline")
    # EMA fast/mid cross
    if crossed_up("ema_fast", "ema_mid"):
        bull.append("EMA20 crossed above EMA50")
    if crossed_down("ema_fast", "ema_mid"):
        bear.append("EMA20 crossed below EMA50")
    # Volume spike confirming the turn
    if not np.isnan(r.vol_ratio) and r.vol_ratio >= c.get("volume_spike", 1.5):
        if r.close > r.open:
            bull.append(f"Volume spike ({r.vol_ratio:.1f}x avg) on bullish candle")
        elif r.close < r.open:
            bear.append(f"Volume spike ({r.vol_ratio:.1f}x avg) on bearish candle")

    # ICT turning-point evidence
    has_ict = "ms_trend" in d
    ict_model = {1: False, -1: False}
    if has_ict:
        if (win["choch"] > 0).any():
            lvl = win.loc[win["choch"] > 0, "break_level"].iloc[-1]
            bull.append(f"ICT: Change of Character / MSS — closed above swing high {_f(lvl)}")
        if (win["choch"] < 0).any():
            lvl = win.loc[win["choch"] < 0, "break_level"].iloc[-1]
            bear.append(f"ICT: Change of Character / MSS — closed below swing low {_f(lvl)}")
        swl = d.iloc[max(0, i - c.get("sweep_bars", 10)) : i + 1]   # sweep may precede the MSS
        if (swl["sweep"] > 0).any():
            lvl = swl.loc[swl["sweep"] > 0, "sweep_level"].iloc[-1]
            bull.append(f"ICT: Sell-side liquidity sweep below {_f(lvl)} (stop hunt), closed back above")
            ict_model[1] = (win["choch"] > 0).any()
        if (swl["sweep"] < 0).any():
            lvl = swl.loc[swl["sweep"] < 0, "sweep_level"].iloc[-1]
            bear.append(f"ICT: Buy-side liquidity sweep above {_f(lvl)} (stop hunt), closed back below")
            ict_model[-1] = (win["choch"] < 0).any()
        if (win["fvg_react"] > 0).any():
            bull.append("ICT: Price rejected a bullish Fair Value Gap")
        if (win["fvg_react"] < 0).any():
            bear.append("ICT: Price rejected a bearish Fair Value Gap")
        if (win["ob_react"] > 0).any():
            bull.append("ICT: Reaction from a bullish Order Block")
        if (win["ob_react"] < 0).any():
            bear.append("ICT: Reaction from a bearish Order Block")

    if len(bull) >= min_conf and len(bull) > len(bear):
        direction, reasons = "BUY", bull
    elif len(bear) >= min_conf and len(bear) > len(bull):
        direction, reasons = "SELL", bear
    else:
        return None

    # Trend filter: only buy above / sell below the slow EMA (EMA200 by default).
    # On real gold data this turned losing counter-trend signals into a small edge.
    if c.get("trend_filter", "ema200") == "ema200":
        if direction == "BUY" and r.close < r.ema_slow:
            return None
        if direction == "SELL" and r.close > r.ema_slow:
            return None

    # The current bar must confirm direction (close in the signal direction)
    if c.get("require_confirmation_candle", True):
        if direction == "BUY" and not r.close > r.open:
            return None
        if direction == "SELL" and not r.close < r.open:
            return None

    a = float(r.atr)
    sl_mult = c.get("sl_atr", 1.5)
    rr1, rr2 = c.get("tp1_rr", 1.5), c.get("tp2_rr", 3.0)
    entry = float(r.close)
    sign = 1 if direction == "BUY" else -1
    risk = sl_mult * a
    notes, target = [], None
    if has_ict:
        # ICT stop: just beyond the swept / reversal extreme, if it is a sane distance
        if c.get("sl_mode", "structure") == "structure":
            ext = d["low"].iloc[max(0, i - c.get("sweep_bars", 10)) : i + 1].min() if sign > 0 \
                else d["high"].iloc[max(0, i - c.get("sweep_bars", 10)) : i + 1].max()
            srisk = abs(entry - ext) + 0.2 * a
            if 0.5 * a <= srisk <= 3 * a:
                risk = srisk
        pos = r.pd_pos
        zone = ict.pd_label(pos)
        if zone != "n/a":
            good = (sign > 0 and pos < 0.5) or (sign < 0 and pos > 0.5)
            notes.append(f"ICT {zone} zone — " + ("good location" if good else "⚠ poor location (buying in premium / selling in discount)"))
        if r.killzone:
            notes.append(f"Inside {r.killzone} kill zone")
        lt = r.swing_high if sign > 0 else r.swing_low
        if not np.isnan(lt) and (lt - entry) * sign > 0:
            target = float(lt)
            notes.append(f"Draw on liquidity: {'buy' if sign > 0 else 'sell'}-side at {_f(lt)}")
        if ict_model[sign]:
            notes.append("✅ ICT reversal model: liquidity sweep + market structure shift")
    # Confidence is NOT derived from the number of confirming signals: on real gold
    # data more confluence did not mean better trades. The agent rates each alert
    # from the measured track record instead (see backtest.track_record).
    n = len(reasons)
    return Signal(
        direction=direction,
        confluence=n,
        reasons=reasons,
        entry=entry,
        stop_loss=entry - sign * risk,
        take_profit_1=entry + sign * risk * rr1,
        take_profit_2=entry + sign * risk * rr2,
        confidence="unrated",
        time=d.index[i],
        notes=notes,
        liquidity_target=target,
    )


def effective_cfg(cfg: dict | None, timeframe: str | None) -> dict:
    """Apply per-timeframe overrides, e.g. [signals.min_confluence_by_tf] "4h" = 3."""
    cfg = dict(cfg or {})
    sig = dict(cfg.get("signals", {}))
    by_tf = sig.get("min_confluence_by_tf", {})
    if timeframe in by_tf:
        sig["min_confluence"] = by_tf[timeframe]
    cfg["signals"] = sig
    return cfg


def analyze(df: pd.DataFrame, symbol: str, timeframe: str, cfg: dict | None = None,
            higher_df: pd.DataFrame | None = None) -> Analysis:
    """Full analysis of the latest bar of df."""
    cfg = effective_cfg(cfg, timeframe)
    d = prepare(df, cfg)
    i = len(d) - 1
    score, comp = score_row(d, i, cfg.get("weights"))
    trend, strength = classify(score, cfg.get("trend_threshold", 25))
    r = d.iloc[i]

    htf_trend = None
    if higher_df is not None and len(higher_df) > 60:
        hd = prepare(higher_df, cfg)
        hs, _ = score_row(hd, len(hd) - 1, cfg.get("weights"))
        htf_trend, _ = classify(hs, cfg.get("trend_threshold", 25))

    sig = turning_point(d, i, cfg)
    if sig and htf_trend:
        against = (sig.direction == "BUY" and htf_trend == "BEARISH") or (sig.direction == "SELL" and htf_trend == "BULLISH")
        aligned = (sig.direction == "BUY" and htf_trend == "BULLISH") or (sig.direction == "SELL" and htf_trend == "BEARISH")
        if against and cfg.get("signals", {}).get("respect_higher_tf", False):
            sig = None
        elif against:
            sig.notes.append(f"⚠ Against higher-timeframe trend ({htf_trend})")
        elif aligned:
            sig.notes.append(f"Aligned with higher-timeframe trend ({htf_trend})")

    ind = {
        "RSI": round(float(r.rsi), 1),
        "MACD": round(float(r.macd), 5),
        "MACD_hist": round(float(r.macd_hist), 5),
        "CCI": round(float(r.cci), 1),
        "ADX": round(float(r.adx), 1),
        "ATR": round(float(r.atr), 5),
        "EMA20": round(float(r.ema_fast), 5),
        "EMA50": round(float(r.ema_mid), 5),
        "EMA200": round(float(r.ema_slow), 5),
        "Vol_ratio": None if np.isnan(r.vol_ratio) else round(float(r.vol_ratio), 2),
    }
    if "ms_trend" in d:
        ind["Structure"] = {1: "Bullish", -1: "Bearish"}.get(int(r.ms_trend), "Unclear")
        ind["PD_zone"] = ict.pd_label(r.pd_pos)
        ind["Killzone"] = r.killzone or "-"
        ind["ICT_events"] = [lbl for col, lbl in (("choch", "CHoCH"), ("bos", "BOS"), ("sweep", "Sweep"),
                                                  ("fvg_new", "New FVG"), ("fvg_react", "FVG tap"), ("ob_react", "OB tap"))
                             if r[col] != 0]
    return Analysis(
        symbol=symbol,
        timeframe=timeframe,
        time=d.index[i],
        price=float(r.close),
        score=round(score, 1),
        trend=trend,
        strength=strength,
        components=comp,
        indicators=ind,
        candles=[n for n, _ in patterns.describe(r)],
        higher_tf_trend=htf_trend,
        signal=sig,
    )
