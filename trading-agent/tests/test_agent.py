import numpy as np
import pandas as pd
import pytest

from fxagent import analysis, backtest, indicators, patterns
from fxagent.agent import TradingAgent


def make_df(closes, vol=True, seed=0):
    rng = np.random.default_rng(seed)
    c = np.asarray(closes, dtype=float)
    o = np.r_[c[0], c[:-1]]
    spread = np.abs(np.diff(np.r_[c[0], c])) + c * 0.001
    h = np.maximum(o, c) + spread * rng.uniform(0.1, 0.6, len(c))
    l = np.minimum(o, c) - spread * rng.uniform(0.1, 0.6, len(c))
    v = rng.integers(1000, 2000, len(c)).astype(float) if vol else np.zeros(len(c))
    idx = pd.date_range("2025-01-01", periods=len(c), freq="h", tz="UTC")
    return pd.DataFrame({"open": o, "high": h, "low": l, "close": c, "volume": v}, index=idx)


def trend_series(n, start, slope, noise, seed=1):
    rng = np.random.default_rng(seed)
    return start + slope * np.arange(n) + rng.normal(0, noise, n).cumsum() * 0.2


def test_rsi_bounds_and_extremes():
    up = make_df(np.linspace(100, 200, 100))
    down = make_df(np.linspace(200, 100, 100))
    assert indicators.rsi(up["close"]).iloc[-1] > 90
    assert indicators.rsi(down["close"]).iloc[-1] < 10
    r = indicators.rsi(make_df(trend_series(300, 100, 0, 1))["close"]).dropna()
    assert r.between(0, 100).all()


def test_macd_sign_follows_trend():
    up = make_df(np.linspace(100, 150, 120))
    m = indicators.macd(up["close"])
    assert m["macd"].iloc[-1] > 0


def test_cci_and_adx_reasonable():
    df = make_df(np.linspace(100, 150, 120))
    assert indicators.cci(df).iloc[-1] > 0
    a = indicators.adx(df)
    assert a["plus_di"].iloc[-1] > a["minus_di"].iloc[-1]
    assert a["adx"].iloc[-1] > 25


def test_engulfing_detection():
    df = pd.DataFrame(
        {"open": [10, 10.0, 9.4], "high": [10.2, 10.1, 10.6], "low": [9.8, 9.4, 9.3],
         "close": [10.1, 9.5, 10.5], "volume": [1, 1, 1]},
        index=pd.date_range("2025", periods=3, freq="h", tz="UTC"),
    )
    assert patterns.engulfing(df).iloc[-1] == 1


@pytest.mark.parametrize("vol", [True, False])
def test_trend_classification(vol):
    bull = analysis.analyze(make_df(trend_series(400, 100, 0.15, 0.5), vol=vol), "TEST", "1h")
    bear = analysis.analyze(make_df(trend_series(400, 160, -0.15, 0.5), vol=vol), "TEST", "1h")
    assert bull.trend == "BULLISH" and bull.score > 0
    assert bear.trend == "BEARISH" and bear.score < 0
    if not vol:
        assert bull.components["volume"] is None


def test_turning_point_detected_at_v_bottom():
    # long decline followed by a sharp recovery -> expect a BUY turn near the bottom
    closes = np.r_[trend_series(300, 200, -0.25, 0.4), trend_series(80, 125, 0.6, 0.4, seed=3)]
    d = analysis.prepare(make_df(closes))
    sigs = [analysis.turning_point(d, i) for i in range(290, 340)]
    sigs = [s for s in sigs if s]
    assert sigs, "expected a turning point near the reversal"
    assert sigs[0].direction == "BUY"
    s = sigs[0]
    assert s.stop_loss < s.entry < s.take_profit_1 < s.take_profit_2


def test_no_lookahead_in_signals():
    closes = np.r_[trend_series(300, 200, -0.25, 0.4), trend_series(80, 125, 0.6, 0.4, seed=3)]
    df = make_df(closes)
    full = analysis.prepare(df)
    for i in range(280, 370, 7):
        part = analysis.prepare(df.iloc[: i + 1])
        a = analysis.turning_point(full, i)
        b = analysis.turning_point(part, i)
        assert (a is None) == (b is None)
        if a:
            assert a.direction == b.direction and a.reasons == b.reasons


def test_backtest_runs():
    closes = np.r_[
        trend_series(300, 200, -0.2, 0.6),
        trend_series(300, 140, 0.2, 0.6, seed=5),
        trend_series(300, 200, -0.2, 0.6, seed=7),
    ]
    out = backtest.run(make_df(closes))
    assert out["summary"]["signals"] >= 1
    assert set(out["trades"]["outcome"]) <= {"tp1", "tp2", "stop", "timeout"}


def test_agent_scan_alerts_once(monkeypatch, tmp_path, capsys):
    closes = np.r_[trend_series(300, 200, -0.25, 0.4), trend_series(30, 125, 0.6, 0.4, seed=3)]
    df = make_df(closes)
    from fxagent import data
    monkeypatch.setattr(data, "get_data", lambda s, tf, **k: df)
    agent = TradingAgent({"agent": {"symbols": ["XAUUSD"], "timeframes": ["1h"],
                                    "state_file": str(tmp_path / "s.json")}})
    sent = []
    monkeypatch.setattr(agent.notifier, "send", lambda t, x: sent.append(t))
    # scan bar by bar; each signal must be sent only once
    for end in range(300, 331):
        monkeypatch.setattr(data, "get_data", lambda s, tf, e=end, **k: df.iloc[:e])
        agent.scan()
        before = len(sent)
        agent.scan()  # repeated scan on same candle must not re-alert
        assert len(sent) == before
    turn_alerts = [t for t in sent if "turning point" in t]
    assert any("Bullish" in t for t in turn_alerts)
