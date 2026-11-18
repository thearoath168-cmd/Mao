"""Command line: python -m fxagent {scan,watch,analyze,backtest}"""
from __future__ import annotations

import argparse
import json

from . import backtest, data
from .agent import TradingAgent, load_config
from .analysis import analyze
from .notifier import format_signal, format_status


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

    args = p.parse_args(argv)
    cfg = load_config(args.config)

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


if __name__ == "__main__":
    main()
