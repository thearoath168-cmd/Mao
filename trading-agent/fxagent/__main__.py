"""Command line: python -m fxagent {scan,watch,analyze,backtest,test-notify}"""
from __future__ import annotations

import argparse
import json

import pandas as pd

from . import backtest, data
from .agent import TradingAgent, load_config
from .analysis import Analysis, Signal, analyze
from .notifier import Notifier, format_signal, format_status


def main(argv=None) -> None:
    p = argparse.ArgumentParser(prog="fxagent", description="Forex & gold trend-tracking agent")
    p.add_argument("--config", help="path to config.toml")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("scan", help="scan all configured symbols once and send alerts")
    s.add_argument("--no-alert", action="store_true")

    w = sub.add_parser("watch", help="run continuously and alert on turning points")
    w.add_argument("--interval", type=int, help="seconds between scans")

    a = sub.add_parser("analyze", help="detailed analysis of one symbol")
    a.add_argument("symbol")
    a.add_argument("-t", "--timeframe", default="1h")
    a.add_argument("--csv", help="use a local CSV instead of Yahoo")

    b = sub.add_parser("backtest", help="test turning-point signals on history")
    b.add_argument("symbol")
    b.add_argument("-t", "--timeframe", default="1h")
    b.add_argument("--csv", help="use a local CSV instead of Yahoo")
    b.add_argument("--max-bars", type=int, default=48, help="bars to hold before timing out")
    b.add_argument("--show-trades", action="store_true")

    sub.add_parser("test-notify", help="send a sample alert to check your Telegram/Discord/ntfy setup")

    args = p.parse_args(argv)
    cfg = load_config(args.config)

    if args.cmd == "test-notify":
        raise SystemExit(run_test_notify(cfg))
    if args.cmd == "scan":
        TradingAgent(cfg).scan(alert=not args.no_alert)
    elif args.cmd == "watch":
        TradingAgent(cfg).watch(args.interval)
    elif args.cmd == "analyze":
        df = data.load_csv(args.csv) if args.csv else data.get_data(args.symbol, args.timeframe)
        res = analyze(df, args.symbol.upper(), args.timeframe, cfg)
        print(format_status(res))
        print("Score components (-1 bearish .. +1 bullish):", json.dumps(res.components))
        print("Indicators:", json.dumps(res.indicators))
        print(format_signal(res) if res.signal else "No turning point on the last closed candle.")
    elif args.cmd == "backtest":
        df = data.load_csv(args.csv) if args.csv else data.get_data(args.symbol, args.timeframe)
        out = backtest.run(df, cfg, max_bars=args.max_bars)
        print(f"Backtest {args.symbol.upper()} {args.timeframe}: {len(df)} candles "
              f"({df.index[0]:%Y-%m-%d} → {df.index[-1]:%Y-%m-%d})")
        for k, v in out["summary"].items():
            print(f"  {k}: {v}")
        if args.show_trades and not out["trades"].empty:
            print(out["trades"].to_string(index=False))


def sample_alert() -> Analysis:
    """A fake BUY alert on gold so you can see exactly what real alerts look like."""
    now = pd.Timestamp.now(tz="UTC").floor("h")
    sig = Signal(
        direction="BUY", confluence=5, confidence="high", time=now,
        reasons=[
            "ICT: Sell-side liquidity sweep below 2,598.40 (stop hunt), closed back above",
            "ICT: Change of Character / MSS — closed above swing high 2,612.10",
            "RSI crossed back above 30 (leaving oversold)",
            "MACD bullish crossover below zero",
            "Bullish Engulfing candle at support / oversold area",
        ],
        notes=["ICT Discount (OTE) zone — good location", "Inside London kill zone",
               "Draw on liquidity: buy-side at 2,655.00",
               "✅ ICT reversal model: liquidity sweep + market structure shift"],
        entry=2615.20, stop_loss=2596.80, take_profit_1=2642.80, take_profit_2=2670.40,
        liquidity_target=2655.00,
    )
    return Analysis(
        symbol="XAUUSD", timeframe="1h", time=now, price=2615.20, score=38.0,
        trend="BULLISH", strength="moderate", higher_tf_trend="BULLISH", signal=sig,
        indicators={"RSI": 41.2, "CCI": -64.0, "ADX": 27.5},
    )


def run_test_notify(cfg: dict) -> int:
    n = Notifier(cfg.get("notify", {}))
    channels = [c for c in n.channels() if c != "console"]
    if not channels:
        print("No notification channel is configured, so alerts only print here.\n"
              "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID (or DISCORD_WEBHOOK_URL / NTFY_TOPIC)\n"
              "and run `python -m fxagent test-notify` again. See README → Getting notifications.")
        return 1
    text = "🧪 TEST ALERT — your fxagent notifications work!\n\n" + format_signal(sample_alert())
    results = n.send("fxagent test alert", text)
    print()
    for ch, err in results.items():
        print(f"  {'✅' if err is None else '❌'} {ch}: {'sent' if err is None else err}")
    failed = [c for c, e in results.items() if e]
    print("\nAll channels OK." if not failed else f"\n{len(failed)} channel(s) failed — see the hints above.")
    return 1 if failed else 0


if __name__ == "__main__":
    main()
