"""Notification channels: console, Telegram, Discord, ntfy.sh (phone push)."""
from __future__ import annotations

import os

import requests

from .analysis import Analysis


def _fmt(x: float) -> str:
    return f"{x:,.2f}" if abs(x) >= 100 else f"{x:.5f}"


def _confidence_line(a: Analysis) -> str:
    s, tr = a.signal, a.signal.track_record
    if not tr:
        return f"Confidence: NOT RATED  ({s.confluence} confirming signals)"
    if tr["signals"] == 0:
        return f"Confidence: NOT RATED (no past signals)  ({s.confluence} confirming signals)"
    label = "NOT RATED (too few past signals)" if s.confidence == "unrated" else s.confidence.upper()
    return (f"Confidence: {label} — past {tr['signals']} signals on {a.symbol} {a.timeframe} "
            f"since {tr['since']:%b %Y}: {tr['win_rate']:.0f}% won, avg {tr['avg_R']:+.2f}R "
            f"(before costs)\nConfirming signals: {s.confluence}")


def format_signal(a: Analysis) -> str:
    s = a.signal
    arrow = "🟢 BULLISH TURN — BUY" if s.direction == "BUY" else "🔴 BEARISH TURN — SELL"
    lines = [
        f"{arrow}  {a.symbol} ({a.timeframe})",
        f"Time: {s.time:%Y-%m-%d %H:%M} UTC   Price: {_fmt(s.entry)}",
        _confidence_line(a),
        f"Trend score: {a.score:+.0f} ({a.trend.lower()}, {a.strength})"
        + (f"   Higher TF: {a.higher_tf_trend}" if a.higher_tf_trend else ""),
        "",
        "Why:",
        *[f" • {r}" for r in s.reasons],
        *([""] + [f" ◦ {x}" for x in s.notes] if s.notes else []),
        "",
        f"Entry: {_fmt(s.entry)}",
        f"Stop loss: {_fmt(s.stop_loss)}",
        f"TP1: {_fmt(s.take_profit_1)}   TP2: {_fmt(s.take_profit_2)}"
        + (f"   Liquidity target: {_fmt(s.liquidity_target)}" if s.liquidity_target else ""),
        f"RSI {a.indicators['RSI']} | CCI {a.indicators['CCI']} | ADX {a.indicators['ADX']}",
        "",
        "Not financial advice. Always manage your risk.",
    ]
    return "\n".join(lines)


def format_status(a: Analysis) -> str:
    icon = {"BULLISH": "🟢", "BEARISH": "🔴", "NEUTRAL": "⚪"}[a.trend]
    htf = f" | HTF {a.higher_tf_trend}" if a.higher_tf_trend else ""
    cs = f" | candles: {', '.join(a.candles)}" if a.candles else ""
    i = a.indicators
    if "Structure" in i:
        ev = f" [{', '.join(i['ICT_events'])}]" if i["ICT_events"] else ""
        kz = f" {i['Killzone']}" if i["Killzone"] != "-" else ""
        cs += f" | ICT {i['Structure']} {i['PD_zone']}{kz}{ev}"
    return (
        f"{icon} {a.symbol:<7} {a.timeframe:<3} {_fmt(a.price):>11}  "
        f"{a.trend:<7} {a.score:+6.1f} ({a.strength}){htf} | "
        f"RSI {i['RSI']} MACDh {i['MACD_hist']:+.4g} CCI {i['CCI']} ADX {i['ADX']}{cs}"
    )


class Notifier:
    def __init__(self, cfg: dict | None = None):
        cfg = cfg or {}
        self.telegram_token = os.getenv("TELEGRAM_BOT_TOKEN") or cfg.get("telegram_bot_token")
        self.telegram_chat = os.getenv("TELEGRAM_CHAT_ID") or cfg.get("telegram_chat_id")
        self.discord_url = os.getenv("DISCORD_WEBHOOK_URL") or cfg.get("discord_webhook_url")
        self.ntfy_topic = os.getenv("NTFY_TOPIC") or cfg.get("ntfy_topic")
        self.ntfy_server = cfg.get("ntfy_server", "https://ntfy.sh")

    def channels(self) -> list[str]:
        ch = ["console"]
        if self.telegram_token and self.telegram_chat:
            ch.append("telegram")
        if self.discord_url:
            ch.append("discord")
        if self.ntfy_topic:
            ch.append("ntfy")
        return ch

    def send(self, title: str, text: str) -> dict[str, str | None]:
        """Send to every configured channel. Returns {channel: None if ok else error}."""
        print("\n" + "=" * 60 + "\n" + text + "\n" + "=" * 60, flush=True)
        results: dict[str, str | None] = {}
        for name, fn in (("telegram", self._telegram), ("discord", self._discord), ("ntfy", self._ntfy)):
            if name in self.channels():
                try:
                    fn(title, text)
                    results[name] = None
                except Exception as e:
                    results[name] = str(e)
                    print(f"[notifier] {name} failed: {e}")
        return results

    def _telegram(self, title: str, text: str) -> None:
        try:
            r = requests.post(
                f"https://api.telegram.org/bot{self.telegram_token}/sendMessage",
                json={"chat_id": self.telegram_chat, "text": text},
                timeout=15,
            )
        except requests.RequestException as e:
            # never echo the URL: it contains the bot token
            raise RuntimeError(f"network error contacting Telegram ({type(e).__name__})") from None
        if not r.ok:
            try:
                desc = r.json().get("description", r.reason)
            except ValueError:
                desc = r.reason
            hints = {
                401: "check TELEGRAM_BOT_TOKEN (copy it again from @BotFather, no spaces)",
                400: "check TELEGRAM_CHAT_ID, and press Start in the chat with your bot",
                403: "the bot was blocked or removed from the chat; unblock it / add it back",
                404: "check TELEGRAM_BOT_TOKEN (copy it again from @BotFather, no spaces)",
            }
            hint = hints.get(r.status_code, "")
            raise RuntimeError(f"Telegram {r.status_code}: {desc}" + (f" — {hint}" if hint else ""))

    def _discord(self, title: str, text: str) -> None:
        requests.post(self.discord_url, json={"content": text[:1900]}, timeout=15).raise_for_status()

    def _ntfy(self, title: str, text: str) -> None:
        requests.post(
            f"{self.ntfy_server.rstrip('/')}/{self.ntfy_topic}",
            data=text.encode("utf-8"),
            headers={"Title": title.encode("ascii", "ignore").decode(), "Priority": "high", "Tags": "chart_with_upwards_trend"},
            timeout=15,
        ).raise_for_status()
