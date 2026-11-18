"""Market data loading: Yahoo Finance (free, no key) or local CSV."""
from __future__ import annotations

import time
from pathlib import Path

import pandas as pd
import requests

# Friendly names -> Yahoo tickers. Gold futures (GC=F) carry real volume;
# spot FX pairs on Yahoo report zero volume, so volume is skipped for them.
YAHOO_SYMBOLS = {
    "XAUUSD": "GC=F",
    "GOLD": "GC=F",
    "XAGUSD": "SI=F",
    "EURUSD": "EURUSD=X",
    "GBPUSD": "GBPUSD=X",
    "USDJPY": "JPY=X",
    "AUDUSD": "AUDUSD=X",
    "USDCAD": "CAD=X",
    "USDCHF": "CHF=X",
    "NZDUSD": "NZDUSD=X",
    "EURJPY": "EURJPY=X",
    "GBPJPY": "GBPJPY=X",
    "DXY": "DX-Y.NYB",
}

# timeframe -> (yahoo interval, yahoo range, resample rule or None)
TIMEFRAMES = {
    "5m": ("5m", "30d", None),
    "15m": ("15m", "60d", None),
    "30m": ("30m", "60d", None),
    "1h": ("60m", "730d", None),
    "4h": ("60m", "730d", "4h"),
    "1d": ("1d", "10y", None),
    "1wk": ("1wk", "max", None),
}

TF_SECONDS = {"5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400, "1wk": 604800}


def yahoo_ticker(symbol: str) -> str:
    return YAHOO_SYMBOLS.get(symbol.upper(), symbol)


def fetch_yahoo(symbol: str, timeframe: str = "1h", retries: int = 3) -> pd.DataFrame:
    interval, rng, resample = TIMEFRAMES[timeframe]
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_ticker(symbol)}"
    params = {"interval": interval, "range": rng, "includePrePost": "false"}
    headers = {"User-Agent": "Mozilla/5.0 (fxagent)"}
    last_err = None
    for attempt in range(retries):
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=20)
            resp.raise_for_status()
            res = resp.json()["chart"]["result"][0]
            q = res["indicators"]["quote"][0]
            df = pd.DataFrame(
                {
                    "open": q["open"],
                    "high": q["high"],
                    "low": q["low"],
                    "close": q["close"],
                    "volume": q.get("volume") or [0] * len(res["timestamp"]),
                },
                index=pd.to_datetime(res["timestamp"], unit="s", utc=True),
            )
            df = df.dropna(subset=["open", "high", "low", "close"])
            df["volume"] = df["volume"].fillna(0)
            if resample:
                df = resample_ohlc(df, resample)
            return df
        except Exception as e:  # network / parse errors -> retry with backoff
            last_err = e
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Failed to fetch {symbol} {timeframe} from Yahoo: {last_err}")


def resample_ohlc(df: pd.DataFrame, rule: str) -> pd.DataFrame:
    agg = {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
    return df.resample(rule, label="left", closed="left").agg(agg).dropna(subset=["close"])


def load_csv(path: str | Path) -> pd.DataFrame:
    """CSV with columns time/date, open, high, low, close[, volume] (e.g. MT4/MT5 export)."""
    df = pd.read_csv(path)
    df.columns = [c.strip().lower().lstrip("<").rstrip(">") for c in df.columns]
    tcol = next((c for c in ("time", "datetime", "date", "timestamp") if c in df.columns), df.columns[0])
    df.index = pd.to_datetime(df[tcol], utc=True)
    if "volume" not in df.columns:
        df["volume"] = df.get("tickvol", df.get("tick_volume", 0))
    return df[["open", "high", "low", "close", "volume"]].astype(float).sort_index()


def drop_unclosed(df: pd.DataFrame, timeframe: str, now: pd.Timestamp | None = None) -> pd.DataFrame:
    """Remove the last candle if it is still forming, so signals never repaint."""
    if df.empty:
        return df
    now = now or pd.Timestamp.now(tz="UTC")
    last_open = df.index[-1]
    if last_open + pd.Timedelta(seconds=TF_SECONDS[timeframe]) > now:
        return df.iloc[:-1]
    return df


def get_data(symbol: str, timeframe: str, source: str = "yahoo", csv_path: str | None = None) -> pd.DataFrame:
    if source == "csv":
        if not csv_path:
            raise ValueError("csv source requires csv_path")
        return load_csv(csv_path)
    return drop_unclosed(fetch_yahoo(symbol, timeframe), timeframe)
