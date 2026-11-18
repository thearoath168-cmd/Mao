# fxagent — Forex & Gold Trend Tracking Agent

An agent that watches **gold (XAUUSD)** and **forex pairs** and does three things:

1. Reads the **trend**: BULLISH / BEARISH / NEUTRAL, with a score from -100 to +100.
2. Detects **turning points**, where a trend is likely reversing.
3. **Notifies you** by Telegram, Discord, or phone push (ntfy). Each alert includes an
   entry price, a stop loss, and two take-profit levels.

> ⚠️ **No indicator system is always right.** The alerts are probabilities, not certainties.
> Backtest on your own symbol and timeframe (see below), start on a demo account, and always
> use a stop loss. This is not financial advice.

---

## Indicators used

| Indicator | What the agent reads from it |
|---|---|
| **Candlesticks** | Engulfing, Hammer, Shooting Star, Morning/Evening Star, Doji |
| **RSI (14)** | Momentum, overbought (>70) / oversold (<30), **divergence** |
| **MACD (12,26,9)** | Signal-line crossovers, histogram momentum, side of zero |
| **CCI (20)** | Extremes ±100 and cross-backs |
| **ATR (14)** | Volatility, used for stop loss and take profit |
| **ADX / +DI −DI** | Trend strength and direction |
| **Volume / OBV** | Volume spikes confirming a move (gold futures only; spot FX has no volume) |
| **EMA 20/50/200** | Trend structure and EMA crossovers |
| **Bollinger Bands** | Context: is a reversal candle at an extreme? |
| **ICT (Inner Circle Trader)** | Market structure (BOS, CHoCH/MSS), liquidity sweeps, Fair Value Gaps, Order Blocks, Premium/Discount & OTE, Kill Zones |

### ICT concepts in detail
| Concept | How the agent uses it |
|---|---|
| **Swing highs / lows** | Confirmed after 3 candles on each side (`swing_k`); together they form the dealing range |
| **BOS (Break of Structure)** | A candle closes beyond the last swing in the trend direction. Counts toward the trend score as continuation |
| **CHoCH / MSS** | The first close beyond a swing *against* the current structure. A **turning-point signal** |
| **Liquidity sweep** | A wick takes out old lows (sell-side) or highs (buy-side), then the candle closes back inside, like a stop hunt. A **turning-point signal** |
| **Fair Value Gap** | A 3-candle imbalance. When price returns to the gap and rejects it, that is a signal. The latest unfilled gap also feeds the trend bias |
| **Order Block** | The last opposite-colour candle before a structure break. When price returns to it and rejects it, that is a signal |
| **Premium / Discount, OTE** | Where price sits in the dealing range. Alerts say whether a buy is in discount (good location) or premium (poor location) |
| **Kill Zones** | London 02:00–05:00, NY AM 07:00–10:00, NY PM 13:30–16:00 (New York time), shown on alerts |
| **ICT reversal model** | A liquidity sweep followed by a market structure shift. This raises the alert's confidence |

When ICT is on (`sl_mode = "structure"`), the stop loss goes just beyond the swept low or high,
and the alert shows the **draw on liquidity**: the opposite swing that price is likely to target.

### How the trend score works
Each indicator gives a vote from -1 (bearish) to +1 (bullish). The votes are weighted
(the weights are set in `config.toml`) and combined into a score from **-100 to +100**.
- `≥ +25` → **BULLISH**, `≤ -25` → **BEARISH**, in between → NEUTRAL
- `|score| ≥ 60` → strong trend

The agent also checks the **higher timeframe** (for example 4h when you trade 1h) and shows
whether a signal goes with or against it.

### How turning points are detected
A turning point needs **confluence**: at least 4 of these signals on the latest closed candles
(3 on the 4h chart).

- RSI leaves oversold or overbought
- MACD crossover
- CCI crosses back through ±100
- RSI divergence
- Reversal candle at a Bollinger band or RSI extreme
- EMA20/50 cross
- Volume spike
- ICT: CHoCH/MSS, liquidity sweep, FVG rejection, Order Block reaction

The signal candle must also close in the signal's direction, and a **trend filter** only
allows BUY signals above the 200 EMA and SELL signals below it (`trend_filter = "none"` turns
it off). The agent only uses **closed** candles, so signals do not repaint.

**Confidence comes from the track record.** When an alert fires, the agent backtests the
current settings on that symbol and timeframe and puts the result in the alert:
```
Confidence: HIGH — past 186 signals on XAUUSD 1h since Jun 2024: 44% won, avg +0.12R (before costs)
```
- **HIGH** = average of +0.10R or better per trade
- **MEDIUM** = profitable but below +0.10R
- **LOW** = losing
- **NOT RATED** = fewer than 20 past signals

R is profit or loss in units of the risk taken (the distance to the stop loss). The number of
confirming signals is still shown, but it doesn't set the confidence: on real gold data, more
confirming signals did not mean better trades.

---

## Quick start

```bash
cd trading-agent
pip install -r requirements.txt

python -m fxagent scan                  # one scan of all symbols in config.toml
python -m fxagent analyze XAUUSD -t 1h  # detailed breakdown of one symbol
python -m fxagent watch                 # run forever, alert on turning points
python -m fxagent backtest XAUUSD -t 1h --show-trades
python -m fxagent test-notify           # send a sample alert to check notifications
```

Example output:
```
🟢 XAUUSD  1h     2,671.40  BULLISH  +71.1 (strong) | HTF BULLISH | RSI 64.2 MACDh +1.23 CCI 121.4 ADX 34.8
🔴 EURUSD  1h      1.05412  BEARISH  -48.3 (moderate) | HTF BEARISH | RSI 38.1 ...
```

Example alert:
```
🟢 BULLISH TURN — BUY  XAUUSD (1h)
Confidence: HIGH  (5 confirming signals)
Why:
 • RSI crossed back above 30 (leaving oversold)
 • MACD bullish crossover below zero
 • Bullish RSI divergence (lower low in price, higher low in RSI)
 • Bullish Engulfing candle at support / oversold area
 • Volume spike (1.8x avg) on bullish candle
Entry: 2,601.20   Stop loss: 2,583.50   TP1: 2,627.75   TP2: 2,654.30
```

Market data comes from Yahoo Finance and needs no API key. Gold uses gold futures (`GC=F`).
You can also load candles exported from MT4/MT5: `--csv mydata.csv`, with columns
time, open, high, low, close, volume.

Supported symbols: XAUUSD, XAGUSD, EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, NZDUSD,
EURJPY, GBPJPY, DXY. Any other Yahoo ticker also works.
Supported timeframes: 5m, 15m, 30m, 1h, 4h, 1d.

---

## Getting notifications

Set one or more of these environment variables. If none are set, alerts print to the console.

| Channel | Setup |
|---|---|
| **ntfy (easiest, phone push)** | Install the *ntfy* app (iOS/Android) and subscribe to a long random topic name. Then set `NTFY_TOPIC=that-name` |
| **Telegram** | Create a bot with @BotFather → `TELEGRAM_BOT_TOKEN`. Send the bot a message, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` to find `TELEGRAM_CHAT_ID` |
| **Discord** | Channel settings → Integrations → Webhook → `DISCORD_WEBHOOK_URL` |

**Check your setup:** `python -m fxagent test-notify` sends a sample alert to every configured
channel and shows ✅ or ❌ for each one, with a hint when something is wrong (for example a bad
token or chat ID). On GitHub: **Actions → FX & Gold trend agent → Run workflow** and tick
*Only send a test alert*.

You also get an alert when the overall trend flips (set `notify_trend_change` in `config.toml`).

### Run it 24/7 for free with GitHub Actions
The workflow `.github/workflows/fx-agent.yml` runs a scan every 15 minutes while the market is
open. Add your secrets (`NTFY_TOPIC` and/or the Telegram ones) under
**Settings → Secrets and variables → Actions**, and alerts will reach your phone with no
computer running. You can also start a scan by hand from the **Actions** tab.

---

## Tuning
Everything is in `config.toml`: symbols, timeframes, indicator periods, score weights,
`min_confluence` (raise it for fewer, stronger alerts), stop-loss and take-profit multiples,
the trend filter, and the higher-timeframe filter. **After changing settings, run `backtest`
again** to check that the change helps on real data.

### Backtest results behind the defaults
Real Yahoo Finance data, June 2024 to November 2026 (daily: 2016 to 2026), before spread and
commission. Old = 3 confirming signals and no trend filter. New = the current defaults.

| Market | Old: signals / avg R | New: signals / avg R |
|---|---|---|
| XAUUSD 1h | 553 / −0.04R | 186 / **+0.12R** (44% won) |
| XAUUSD 4h | 159 / +0.01R | 94 / **+0.15R** (45% won) |
| XAUUSD 1d | 110 / −0.16R | 28 / +0.17R (small sample) |
| EURUSD 1h | 624 / +0.03R | 195 / **+0.12R** |
| GBPUSD 1h | 679 / −0.05R | 194 / **+0.09R** |
| USDJPY 1h | 612 / +0.02R | 175 / +0.01R |
| EURUSD / GBPUSD / USDJPY 4h | +0.06 / +0.05 / +0.09R | −0.13 / +0.04 / −0.02R ⚠ |

The settings were tuned on gold. On 1h they also helped EURUSD and GBPUSD, which they were not
tuned on. On 4h they made the forex pairs worse, so for 4h forex consider
`trend_filter = "none"` and check with `backtest`. These edges are small. They come from a
short period in which gold mostly rose, and live results are likely to be worse.

## Tests
```bash
pip install pytest && python -m pytest -q
```
