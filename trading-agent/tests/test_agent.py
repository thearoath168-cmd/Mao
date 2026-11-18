import numpy as np
import pandas as pd
import pytest

from fxagent import analysis, backtest, indicators, patterns
from fxagent.agent import TradingAgent

# Raw reversal detector (no trend filter, 3 confirmations), used by tests that
# check bottom/top detection itself. The shipped defaults filter these out.
DETECTOR = {"signals": {"min_confluence": 3, "trend_filter": "none"}}


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
    sigs = [analysis.turning_point(d, i, DETECTOR) for i in range(290, 340)]
    sigs = [s for s in sigs if s]
    assert sigs, "expected a turning point near the reversal"
    assert sigs[0].direction == "BUY"
    s = sigs[0]
    assert s.stop_loss < s.entry < s.take_profit_1 < s.take_profit_2


@pytest.mark.parametrize("kind", ["smooth", "wave"])
def test_no_lookahead_in_signals(kind):
    closes = np.r_[trend_series(300, 200, -0.25, 0.4), trend_series(80, 125, 0.6, 0.4, seed=3)]
    if kind == "wave":
        closes = wave_reversal()
    df = make_df(closes)
    full = analysis.prepare(df)
    for i in range(220, len(df) - 1, 3):
        part = analysis.prepare(df.iloc[: i + 1])
        a = analysis.turning_point(full, i, DETECTOR)
        b = analysis.turning_point(part, i, DETECTOR)
        assert (a is None) == (b is None)
        if a:
            assert a.direction == b.direction and a.reasons == b.reasons and a.stop_loss == b.stop_loss


def test_backtest_runs():
    closes = np.r_[
        trend_series(300, 200, -0.2, 0.6),
        trend_series(300, 140, 0.2, 0.6, seed=5),
        trend_series(300, 200, -0.2, 0.6, seed=7),
    ]
    out = backtest.run(make_df(closes), DETECTOR)
    assert out["summary"]["signals"] >= 1
    assert set(out["trades"]["outcome"]) <= {"tp1", "tp2", "stop", "timeout"}


def test_agent_scan_alerts_once(monkeypatch, tmp_path, capsys):
    closes = np.r_[trend_series(300, 200, -0.25, 0.4), trend_series(30, 125, 0.6, 0.4, seed=3)]
    df = make_df(closes)
    from fxagent import data
    monkeypatch.setattr(data, "get_data", lambda s, tf, **k: df)
    agent = TradingAgent({"agent": {"symbols": ["XAUUSD"], "timeframes": ["1h"],
                                    "state_file": str(tmp_path / "s.json")}, **DETECTOR})
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


# ---------------- ICT ----------------
from fxagent import ict


def wave_reversal():
    # zig-zag decline (lower highs/lows), a stop-hunt low, then zig-zag rally
    t = np.arange(260)
    down = 200 - 0.2 * t + 3 * np.sin(t / 4)
    t2 = np.arange(120)
    up = down[-1] + 0.35 * t2 + 3 * np.sin(t2 / 4 + np.pi)
    return np.r_[down, up]


def _bars(rows):
    idx = pd.date_range("2025-01-01", periods=len(rows), freq="h", tz="UTC")
    df = pd.DataFrame(rows, columns=["open", "high", "low", "close"], index=idx)
    df["volume"] = 0.0
    df["atr"] = 1.0
    return df


def test_fvg_bullish_detected():
    df = _bars([[10, 10.5, 9.8, 10.2], [10.2, 12, 10.1, 11.9], [11.9, 12.5, 11.0, 12.3]])
    out = ict.compute(df, k=1)
    assert out["fvg_new"].iloc[2] == 1   # low[2]=11.0 > high[0]=10.5


def test_choch_on_reversal():
    out = analysis.prepare(make_df(wave_reversal()))
    assert (out["ms_trend"].iloc[150:255] == -1).mean() > 0.8   # bearish structure in decline
    assert (out["choch"].iloc[255:320] > 0).any()                 # bullish shift after bottom
    assert out["ms_trend"].iloc[-1] == 1
    assert (out["fvg_new"] != 0).any()


def test_liquidity_sweep():
    # swing low at 9.0 formed, later a wick to 8.8 that closes back at 9.5
    rows = [[10, 10.2, 9.8, 10], [10, 10.1, 9.5, 9.6], [9.6, 9.7, 9.0, 9.2], [9.2, 9.9, 9.1, 9.8],
            [9.8, 10.3, 9.7, 10.2], [10.2, 10.4, 9.9, 10.0], [10.0, 10.1, 8.8, 9.5]]
    out = ict.compute(_bars(rows), k=1)
    assert out["sweep"].iloc[-1] == 1 and out["sweep_level"].iloc[-1] == 9.0


def test_killzones():
    assert ict.killzone(pd.Timestamp("2025-01-15 08:00", tz="UTC")) == "London"   # 03:00 NY
    assert ict.killzone(pd.Timestamp("2025-01-15 13:30", tz="UTC")) == "NY AM"    # 08:30 NY


def test_ict_no_lookahead():
    closes = wave_reversal()
    df = analysis.prepare(make_df(closes))
    full = ict.compute(df)
    for i in (150, 299, 320, 350):
        part = ict.compute(df.iloc[: i + 1])
        pd.testing.assert_series_equal(full.iloc[i].drop("killzone").astype(float),
                                       part.iloc[-1].drop("killzone").astype(float), check_names=False)


def test_signal_includes_ict_reasons():
    closes = wave_reversal()
    d = analysis.prepare(make_df(closes))
    sigs = [s for s in (analysis.turning_point(d, i, DETECTOR) for i in range(250, 330)) if s]
    assert any(any(r.startswith("ICT") for r in s.reasons) for s in sigs)


# ---------------- test-notify ----------------
from fxagent.__main__ import run_test_notify


def _env(monkeypatch, **kv):
    for k in ("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "DISCORD_WEBHOOK_URL", "NTFY_TOPIC"):
        monkeypatch.delenv(k, raising=False)
    for k, v in kv.items():
        monkeypatch.setenv(k, v)


class _Resp:
    def __init__(self, code, body):
        self.status_code, self._body, self.ok, self.reason = code, body, code < 400, "x"

    def json(self):
        return self._body


def test_test_notify_without_channels(monkeypatch, capsys):
    _env(monkeypatch)
    assert run_test_notify({}) == 1
    assert "No notification channel" in capsys.readouterr().out


def test_test_notify_telegram_ok(monkeypatch, capsys):
    _env(monkeypatch, TELEGRAM_BOT_TOKEN="123:SECRET", TELEGRAM_CHAT_ID="42")
    sent = {}
    monkeypatch.setattr("fxagent.notifier.requests.post",
                        lambda url, json=None, **k: sent.update(json) or _Resp(200, {"ok": True}))
    assert run_test_notify({}) == 0
    assert sent["chat_id"] == "42" and "TEST ALERT" in sent["text"] and "XAUUSD" in sent["text"]
    assert "✅ telegram: sent" in capsys.readouterr().out


def test_test_notify_telegram_bad_chat_hides_token(monkeypatch, capsys):
    _env(monkeypatch, TELEGRAM_BOT_TOKEN="123:SECRET", TELEGRAM_CHAT_ID="999")
    monkeypatch.setattr("fxagent.notifier.requests.post",
                        lambda *a, **k: _Resp(400, {"ok": False, "description": "Bad Request: chat not found"}))
    assert run_test_notify({}) == 1
    out = capsys.readouterr().out
    assert "chat not found" in out and "TELEGRAM_CHAT_ID" in out
    assert "SECRET" not in out


# ---------------- trend filter / confidence ----------------
from fxagent.notifier import format_signal


def _v_bottom():
    return np.r_[trend_series(300, 200, -0.25, 0.4), trend_series(80, 125, 0.6, 0.4, seed=3)]


def test_trend_filter_blocks_counter_trend_buys():
    d = analysis.prepare(make_df(_v_bottom()))
    filt = {"signals": {"min_confluence": 3, "trend_filter": "ema200"}}
    for i in range(290, 340):
        s = analysis.turning_point(d, i, filt)
        if s is not None:
            r = d.iloc[i]
            assert (s.direction == "BUY") == (r.close > r.ema_slow)
    # without the filter the same bars do produce a BUY below the EMA200
    raw = [analysis.turning_point(d, i, DETECTOR) for i in range(290, 340)]
    assert any(s and s.direction == "BUY" and d.loc[s.time, "close"] < d.loc[s.time, "ema_slow"] for s in raw)


def test_min_confluence_by_timeframe():
    cfg = {"signals": {"min_confluence": 4, "min_confluence_by_tf": {"4h": 3}}}
    assert analysis.effective_cfg(cfg, "4h")["signals"]["min_confluence"] == 3
    assert analysis.effective_cfg(cfg, "1h")["signals"]["min_confluence"] == 4
    assert cfg["signals"]["min_confluence"] == 4      # original not mutated


def test_rating_thresholds():
    assert backtest.rate(10, 0.5) == "unrated"
    assert backtest.rate(50, 0.15) == "high"
    assert backtest.rate(50, 0.03) == "medium"
    assert backtest.rate(50, -0.10) == "low"


def test_track_record_and_alert_text():
    df = make_df(np.r_[trend_series(300, 200, -0.2, 0.6), trend_series(300, 140, 0.2, 0.6, seed=5),
                       trend_series(300, 200, -0.2, 0.6, seed=7)])
    tr = backtest.track_record(df, DETECTOR, "1h")
    assert tr["signals"] >= 1 and tr["rating"] in {"unrated", "high", "medium", "low"}
    d = analysis.prepare(make_df(_v_bottom()))
    s = next(s for s in (analysis.turning_point(d, i, DETECTOR) for i in range(290, 340)) if s)
    assert s.confidence == "unrated"
    a = analysis.Analysis("XAUUSD", "1h", s.time, s.entry, 30, "BULLISH", "moderate",
                          indicators={"RSI": 50, "CCI": 0, "ADX": 20}, signal=s)
    assert "NOT RATED" in format_signal(a)
    s.track_record = {"signals": 120, "win_rate": 45.0, "avg_R": 0.12, "since": df.index[0], "rating": "high"}
    s.confidence = "high"
    txt = format_signal(a)
    assert "HIGH" in txt and "past 120 signals" in txt and "+0.12R" in txt


def test_agent_rates_alerts_from_track_record(monkeypatch, tmp_path):
    df = make_df(_v_bottom())
    from fxagent import data
    agent = TradingAgent({"agent": {"symbols": ["XAUUSD"], "timeframes": ["1h"],
                                    "state_file": str(tmp_path / "s.json"), "notify_trend_change": False},
                          **DETECTOR})
    texts = []
    monkeypatch.setattr(agent.notifier, "send", lambda t, x: texts.append(x))
    for end in range(300, 331):
        monkeypatch.setattr(data, "get_data", lambda s, tf, e=end, **k: df.iloc[:e])
        agent.scan()
    assert texts and all("Confidence:" in t and "past" in t for t in texts)
