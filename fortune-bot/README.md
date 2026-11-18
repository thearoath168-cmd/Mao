# 🔮 Khmer Fortune Teller AI · ហោរាខ្មែរ AI (Telegram bot)

A Telegram bot that answers questions about destiny and fortune in Khmer or English. **Claude** is the reasoning agent. It chooses which systems to use, runs the calculators, combines the results and explains them in a detailed answer. It can also search the web for traditional background.

បូតតេឡេក្រាមសម្រាប់មើលជោគវាសនា ដោយប្រើ AI (Claude) ដែលគណនាតាមកម្មវិធី Khmer Fortune Teller ទាំងអស់ ហើយបកស្រាយលម្អិតជាភាសាខ្មែរ ឬអង់គ្លេស។

## What it can read

| System | Tool | Source |
|---|---|---|
| ☸ Khmer astrology: លគ្ន, ភព ១០, ភព ១២, dignities, ទក្សា, transits | `khmer_horoscope` | HoraKhmer app (Suriyayatra engine) |
| 八 BaZi Four Pillars: Day Master strength, useful gods, luck cycles | `bazi_chart` | khmer-fortune-teller (BaZi) app |
| 十神 Ten Gods + clash patterns | inside `bazi_chart` + system prompt | your *10 Gods* course sheet |
| 🧭 Feng Shui Kua, personal directions, annual flying stars | `feng_shui_kua` | BaZi & Feng Shui app |
| 🔢 Numerology: Life Path, Destiny, Lucky, Maturity (Khmer texts) | `numerology` | Khmer Numerology app |
| 👁 យាមកាំភ្លើង & យាមត្រីនេត្រ | `yam_divination` | Yam app («ប្រជុំតម្រា ឫក្ស-យាម-ជោគ-ជតា») |
| 🃏 Tarot, 78 cards with Khmer meanings | `tarot` | Tarot meanings app |
| ☯ I Ching casting + line texts, Yi Number Oracle (phone/house numbers) | `iching` | I Ching Khmer app |
| 📅 He-Luo date selection | `he_luo_date` | He-Luo app |
| 卦 Xuan Kong Da Gua dates (Zhang + Leyau) | `xuan_kong_date` | XKDG app |
| 💧 San He water method / 三合四局 十二长生 | `san_he_water`, `san_he_stages` | San He apps |
| 📆 Today's Khmer lunar date, day pillars, current យាម | `calendar_info` | Hora + BaZi engines |
| 🌐 Web search / fetch | Claude server tools | the internet |

**The calculations are not rewritten.** At startup the bot opens `../Khmer_Fortune_Teller_App.html` (the combined app in this repo, which embeds all 10 calculators), takes out each app's calculation code and runs it in a Node.js sandbox. The bot therefore gives the same numbers as your apps. If you update that HTML file, the bot picks up the change on its next start.

Users can save their birth details (`save_user_profile`), so they don't have to repeat them. `/profile` shows the saved details and `/forget` deletes them.

## Setup (about 10 minutes)

1. **Create the Telegram bot.** In Telegram, open **@BotFather** and send `/newbot`. Pick a name and username, then copy the **token**.
2. **Get a Claude API key** at <https://console.anthropic.com> → API Keys. API usage is billed per token.
3. **Install Node.js 22.9 or later**, then:
   ```bash
   cd fortune-bot
   npm install
   cp .env.example .env      # paste TELEGRAM_BOT_TOKEN and ANTHROPIC_API_KEY
   npm test                  # checks all 10 calculators
   npm start                 # the bot is now live; message it in Telegram
   ```
   To try the agent without Telegram, run `npm run cli`.

### Run it 24/7

The bot uses long polling, so it doesn't need a public URL or a domain. Any always-on machine works: a VPS, a Raspberry Pi, Railway or Render (as a background worker), or Fly.io. Keep the whole repo checked out, because the bot reads `../Khmer_Fortune_Teller_App.html`. If you deploy only this folder, copy that HTML file in and set `FORTUNE_SOURCE_HTML`.

Example with pm2:
```bash
npm i -g pm2 && pm2 start "npm start" --name fortune-bot && pm2 save
```

## Settings (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `CLAUDE_MODEL` | `claude-opus-5-5` | Claude model |
| `CLAUDE_EFFORT` | `medium` | `low` is faster and cheaper; `high` thinks more deeply |
| `BOT_TZ` | `Asia/Phnom_Penh` | Timezone for "today", lunar day and យាម |
| `ALLOWED_USER_IDS` | empty | Comma-separated Telegram user IDs to make the bot private |
| `MAX_MESSAGES_PER_HOUR` | `30` | Per-user limit, to control cost (`0` = no limit) |
| `MAX_HISTORY_TURNS` | `20` | How many past questions the bot remembers per chat |
| `DATA_DIR` | `./data` | Where saved profiles are stored |

In groups, the bot answers only when someone @mentions it or replies to it.

## Example questions

- «ខ្ញុំកើតថ្ងៃ ១៥ ឧសភា ១៩៩០ ម៉ោង ៨:៣០ ព្រឹក នៅភ្នំពេញ ភេទប្រុស។ ឆ្នាំ ២០២៧ ការងារ និងលុយយ៉ាងម៉េច?»
- "Draw three tarot cards about my relationship."
- «លេខទូរស័ព្ទ 012 345 678 ល្អទេ?» (I Ching number oracle)
- «បាត់កាបូប តើរកឃើញទេ?» (យាមត្រីនេត្រ, using the current time and lunar day)
- "My house sits 175°. Which days in December 2026 are good to move in? I was born 1985-03-02."
- "What does 伤官见官 mean in my chart?"

## Project layout

```
fortune-bot/
  src/engines/load.js     loads the calculators from the HTML apps (vm sandbox)
  src/tools/chinese.js    BaZi, Ten Gods, Feng Shui, He-Luo, XKDG, San He
  src/tools/khmer.js      Hora, numerology, Yam, tarot, I Ching, calendar
  src/tools/index.js      tool schemas for Claude + dispatcher
  src/knowledge/tenGods.js  Ten Gods sheet (transcribed)
  src/prompt.js           the fortune teller's instructions
  src/agent.js            Claude tool-use loop (web search, refusal fallback, prompt caching)
  src/bot.js / index.js   Telegram bot (grammY)
  src/cli.js              terminal chat for testing
  test/                   npm test
```

## Notes

- Readings are for reflection, culture and entertainment. The bot frames health, legal and money answers carefully and points people to professionals.
- Chat history is kept in memory and resets when the bot restarts. Saved profiles are kept in `data/profiles.json`.
- The Khmer lunar date comes from the Suriyayatra (Thai/Khmer) calendar engine. A local almanac can differ by one day in rare years.
- Not included: the Luo Pan compass, because it needs a phone's compass sensor. Users can give a sitting degree instead.
