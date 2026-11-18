"""Technical indicators. All functions take/return pandas Series or DataFrames.

Input DataFrame columns: open, high, low, close, volume (DatetimeIndex).
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()


def sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n).mean()


def rsi(close: pd.Series, n: int = 14) -> pd.Series:
    """Wilder's RSI."""
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    rs = gain / loss.replace(0, np.nan)
    out = 100 - 100 / (1 + rs)
    return out.fillna(100.0).where(loss.notna())


def macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.DataFrame:
    line = ema(close, fast) - ema(close, slow)
    sig = ema(line, signal)
    return pd.DataFrame({"macd": line, "macd_signal": sig, "macd_hist": line - sig})


def true_range(df: pd.DataFrame) -> pd.Series:
    prev = df["close"].shift()
    return pd.concat(
        [df["high"] - df["low"], (df["high"] - prev).abs(), (df["low"] - prev).abs()], axis=1
    ).max(axis=1)


def atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    return true_range(df).ewm(alpha=1 / n, adjust=False).mean()


def cci(df: pd.DataFrame, n: int = 20) -> pd.Series:
    """Commodity Channel Index."""
    tp = (df["high"] + df["low"] + df["close"]) / 3
    ma = tp.rolling(n).mean()
    mad = tp.rolling(n).apply(lambda x: np.mean(np.abs(x - x.mean())), raw=True)
    return (tp - ma) / (0.015 * mad.replace(0, np.nan))


def adx(df: pd.DataFrame, n: int = 14) -> pd.DataFrame:
    """Average Directional Index with +DI / -DI (trend strength & direction)."""
    up = df["high"].diff()
    down = -df["low"].diff()
    plus_dm = pd.Series(np.where((up > down) & (up > 0), up, 0.0), index=df.index)
    minus_dm = pd.Series(np.where((down > up) & (down > 0), down, 0.0), index=df.index)
    tr = true_range(df).ewm(alpha=1 / n, adjust=False).mean()
    plus_di = 100 * plus_dm.ewm(alpha=1 / n, adjust=False).mean() / tr
    minus_di = 100 * minus_dm.ewm(alpha=1 / n, adjust=False).mean() / tr
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    return pd.DataFrame(
        {"adx": dx.ewm(alpha=1 / n, adjust=False).mean(), "plus_di": plus_di, "minus_di": minus_di}
    )


def bollinger(close: pd.Series, n: int = 20, k: float = 2.0) -> pd.DataFrame:
    mid = sma(close, n)
    sd = close.rolling(n).std(ddof=0)
    return pd.DataFrame({"bb_mid": mid, "bb_up": mid + k * sd, "bb_low": mid - k * sd})


def obv(df: pd.DataFrame) -> pd.Series:
    direction = np.sign(df["close"].diff()).fillna(0)
    return (direction * df["volume"]).cumsum()


def add_all(df: pd.DataFrame, cfg: dict | None = None) -> pd.DataFrame:
    """Return a copy of df with every indicator column added."""
    c = cfg or {}
    out = df.copy()
    out["ema_fast"] = ema(out["close"], c.get("ema_fast", 20))
    out["ema_mid"] = ema(out["close"], c.get("ema_mid", 50))
    out["ema_slow"] = ema(out["close"], c.get("ema_slow", 200))
    out["rsi"] = rsi(out["close"], c.get("rsi_period", 14))
    out = out.join(macd(out["close"], c.get("macd_fast", 12), c.get("macd_slow", 26), c.get("macd_signal", 9)))
    out["atr"] = atr(out, c.get("atr_period", 14))
    out["cci"] = cci(out, c.get("cci_period", 20))
    out = out.join(adx(out, c.get("adx_period", 14)))
    out = out.join(bollinger(out["close"], c.get("bb_period", 20), c.get("bb_k", 2.0)))
    has_volume = out["volume"].fillna(0).sum() > 0
    if has_volume:
        out["vol_ratio"] = out["volume"] / sma(out["volume"], c.get("volume_period", 20)).replace(0, np.nan)
        out["obv"] = obv(out)
        out["obv_slope"] = out["obv"].diff(5)
    else:  # spot FX has no centralized volume
        out["vol_ratio"] = np.nan
        out["obv"] = np.nan
        out["obv_slope"] = np.nan
    return out
