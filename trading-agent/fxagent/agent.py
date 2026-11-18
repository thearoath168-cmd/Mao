"""The tracking agent: scans symbols, reports trend, alerts on turning points."""
from __future__ import annotations

import json
import time
import tomllib
from pathlib import Path

import pandas as pd

from . import data
from .analysis import Analysis, analyze
from .notifier import Notifier, format_signal, format_status

DEFAULT_CONFIG = Path(__file__).resolve().parent.parent / "config.toml"


def load_config(path: str | Path | None = None) -> dict:
    p = Path(path) if path else DEFAULT_CONFIG
    if not p.exists():
        return {}
    with open(p, "rb") as f:
        return tomllib.load(f)


class State:
    """Remembers which signals were already sent so you are not spammed."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        try:
            self.data = json.loads(self.path.read_text())
        except Exception:
            self.data = {}

    def seen(self, key: str) -> bool:
        return key in self.data

    def mark(self, key: str, value: str) -> None:
        self.data[key] = value
        # keep the file small
        if len(self.data) > 500:
            self.data = dict(list(self.data.items())[-300:])
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.data, indent=1))


class TradingAgent:
    def __init__(self, cfg: dict | None = None):
        self.cfg = cfg or {}
        a = self.cfg.get("agent", {})
        self.symbols = a.get("symbols", ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY"])
        self.timeframes = a.get("timeframes", ["1h"])
        self.higher_tf = a.get("higher_timeframe", {"5m": "1h", "15m": "1h", "30m": "4h", "1h": "4h", "4h": "1d", "1d": "1wk"})
        self.notifier = Notifier(self.cfg.get("notify", {}))
        self.state = State(a.get("state_file", Path(__file__).resolve().parent.parent / ".agent_state.json"))
        self.notify_trend_change = a.get("notify_trend_change", True)
        self._cache: dict = {}

    def _get(self, symbol: str, tf: str) -> pd.DataFrame:
        k = (symbol, tf)
        if k not in self._cache:
            self._cache[k] = data.get_data(symbol, tf)
        return self._cache[k]

    def analyze_symbol(self, symbol: str, tf: str) -> Analysis:
        df = self._get(symbol, tf)
        htf = self.higher_tf.get(tf)
        hdf = None
        if htf:
            try:
                hdf = self._get(symbol, htf)
            except Exception as e:
                print(f"[agent] higher TF {htf} unavailable for {symbol}: {e}")
        return analyze(df, symbol, tf, self.cfg, hdf)

    def scan(self, alert: bool = True) -> list[Analysis]:
        self._cache.clear()
        results = []
        print(f"\n— Scan {pd.Timestamp.now(tz='UTC'):%Y-%m-%d %H:%M} UTC — channels: {', '.join(self.notifier.channels())}")
        for tf in self.timeframes:
            for sym in self.symbols:
                try:
                    a = self.analyze_symbol(sym, tf)
                except Exception as e:
                    print(f"[agent] {sym} {tf}: {e}")
                    continue
                results.append(a)
                print(format_status(a))
                if alert:
                    self._maybe_alert(a)
        return results

    def _maybe_alert(self, a: Analysis) -> None:
        if a.signal:
            key = f"{a.symbol}|{a.timeframe}|{a.signal.key}"
            if not self.state.seen(key):
                title = f"{a.symbol} {a.timeframe}: {'Bullish' if a.signal.direction == 'BUY' else 'Bearish'} turning point"
                self.notifier.send(title, format_signal(a))
                self.state.mark(key, "sent")
        if self.notify_trend_change:
            tkey = f"trend|{a.symbol}|{a.timeframe}"
            prev = self.state.data.get(tkey)
            if prev and prev != a.trend and a.trend != "NEUTRAL":
                self.notifier.send(
                    f"{a.symbol} {a.timeframe} trend → {a.trend}",
                    f"🔄 Trend change {a.symbol} ({a.timeframe}): {prev} → {a.trend}\n"
                    f"Score {a.score:+.0f} ({a.strength}) at {a.price:.5g}\n{format_status(a)}",
                )
            if prev != a.trend:
                self.state.mark(tkey, a.trend)

    def watch(self, interval_sec: int | None = None) -> None:
        interval = interval_sec or self.cfg.get("agent", {}).get("poll_seconds", 300)
        print(f"Watching {self.symbols} on {self.timeframes}, every {interval}s. Ctrl+C to stop.")
        while True:
            try:
                self.scan()
            except Exception as e:
                print(f"[agent] scan failed: {e}")
            time.sleep(interval)
