"""Walk-forward backtest of turning-point signals (no look-ahead)."""
from __future__ import annotations

import pandas as pd

from .analysis import prepare, turning_point


def run(df: pd.DataFrame, cfg: dict | None = None, max_bars: int = 48, warmup: int = 210) -> dict:
    cfg = cfg or {}
    d = prepare(df, cfg)
    trades = []
    i = warmup
    n = len(d)
    while i < n - 1:
        sig = turning_point(d, i, cfg)
        if not sig:
            i += 1
            continue
        buy = sig.direction == "BUY"
        outcome, r_mult, exit_i = "timeout", 0.0, min(i + max_bars, n - 1)
        risk = abs(sig.entry - sig.stop_loss)
        hit_tp1 = False
        for j in range(i + 1, min(i + 1 + max_bars, n)):
            hi, lo = d["high"].iloc[j], d["low"].iloc[j]
            sl_hit = lo <= sig.stop_loss if buy else hi >= sig.stop_loss
            tp1 = hi >= sig.take_profit_1 if buy else lo <= sig.take_profit_1
            tp2 = hi >= sig.take_profit_2 if buy else lo <= sig.take_profit_2
            if sl_hit and not hit_tp1:      # conservative: SL first if same bar
                outcome, r_mult, exit_i = "stop", -1.0, j
                break
            if tp1 and not hit_tp1:
                hit_tp1 = True
            if hit_tp1 and (tp2 or sl_hit):
                # half closed at TP1, rest at TP2 or breakeven-ish at SL
                rr1 = abs(sig.take_profit_1 - sig.entry) / risk
                rr2 = abs(sig.take_profit_2 - sig.entry) / risk
                outcome = "tp2" if tp2 else "tp1"
                r_mult = 0.5 * rr1 + (0.5 * rr2 if tp2 else -0.5)
                exit_i = j
                break
        else:
            last = d["close"].iloc[exit_i]
            move = (last - sig.entry) if buy else (sig.entry - last)
            if hit_tp1:
                outcome = "tp1"
                r_mult = 0.5 * abs(sig.take_profit_1 - sig.entry) / risk + 0.5 * move / risk
            else:
                r_mult = move / risk
        trades.append(
            {
                "time": sig.time,
                "direction": sig.direction,
                "confidence": sig.confidence,
                "confluence": sig.confluence,
                "entry": sig.entry,
                "outcome": outcome,
                "R": round(r_mult, 2),
            }
        )
        i = exit_i + 1  # one position at a time
    t = pd.DataFrame(trades)
    if t.empty:
        return {"trades": t, "summary": {"signals": 0}}
    wins = t["R"] > 0
    summary = {
        "signals": len(t),
        "win_rate_%": round(100 * wins.mean(), 1),
        "reached_tp1_%": round(100 * t["outcome"].isin(["tp1", "tp2"]).mean(), 1),
        "reached_tp2_%": round(100 * (t["outcome"] == "tp2").mean(), 1),
        "stopped_%": round(100 * (t["outcome"] == "stop").mean(), 1),
        "avg_R": round(t["R"].mean(), 3),
        "total_R": round(t["R"].sum(), 2),
        "by_confidence": t.groupby("confidence")["R"].agg(["count", "mean"]).round(2).to_dict("index"),
    }
    return {"trades": t, "summary": summary}
