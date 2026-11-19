# MedRef Agent

A web app with an AI research agent that builds **VIDAL-style drug monographs** and **clinical pathology algorithms** from live, trusted medical sources.

- **Medicine mode:** type a drug name (INN or brand). The agent pulls the official US label from openFDA/DailyMed, then searches regulators and formularies (EMA, eMC, BNF, ANSM / base-donnees-publique, WHO, LactMed…). It returns dosing for adults, children, renal and hepatic impairment and the elderly, plus contraindications, warnings, adverse effects by frequency, interactions graded by severity, pregnancy and lactation, overdose, pharmacology, recent safety updates and US/EU differences. Every item carries numbered source references.
- **Pathology mode:** type a condition. The agent searches current guidelines (NICE, ESC, AHA/ACC, IDSA, ADA, KDIGO, GINA, GOLD, WHO, HAS…) and returns red flags, diagnostic criteria, work-up, severity scores and treatment lines. The decision **algorithm** can be walked step by step or viewed as a full pathway.
- Output languages: English, French, Khmer, Vietnamese, Spanish.
- Live progress: you can watch each search query and each source as it is found.
- Results are cached for 24 h (configurable). "Re-research now" forces a fresh search.

## Run it

Requires **Node.js 20+**. There are no npm dependencies.

```bash
cp .env.example .env      # then put your key in ANTHROPIC_API_KEY
node server.js            # → http://localhost:3000
```

Without an API key the app runs in **demo mode** with two sample results (amoxicillin; community-acquired pneumonia), so you can try the UI.

**API key:** create one at https://console.anthropic.com. **Web search must be enabled for your organization in the Console** (Settings → Privacy / Tools).

## How the agent works

```
browser ──SSE──► server.js ──► lib/agent.js
                                  ├─ openFDA label API (official label text, free)
                                  └─ Claude Messages API (streaming)
                                       └─ web_search tool, allowed_domains = trusted list
                                  ◄─ JSON monograph / algorithm with numbered sources
```

| File | Role |
|---|---|
| `lib/prompts.js` | Research rules, JSON output schemas, and the **trusted domain lists** (edit these to add your country's regulator, e.g. Cambodia's DDF, or to remove sites) |
| `lib/agent.js` | Streaming agent loop: forwards search queries and sources as progress events, handles `pause_turn`, extracts JSON |
| `lib/openfda.js` | Fetches the latest FDA label to ground the answer in primary-source text |
| `server.js` | HTTP + Server-Sent Events, cache, concurrency limit, demo mode |
| `public/` | Front end (plain HTML/CSS/JS, mobile-first, printable) |

## Settings (`.env`)

| Variable | Default | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Required for live research |
| `CLAUDE_MODEL` | `claude-sonnet-5-5` | `claude-opus-5-5` gives deeper research but is slower and costs more |
| `WEB_SEARCH_TOOL` | `web_search_20250305` | Set to `web_search_20260318` for the newest tool version |
| `MAX_SEARCHES` | `12` | Web searches per query (cost/depth trade-off) |
| `MAX_TOKENS` | `16000` | Output budget |
| `CACHE_TTL_HOURS` | `24` | |
| `MAX_CONCURRENT` | `3` | Simultaneous research jobs |
| `OPENFDA_API_KEY` | — | Optional; raises openFDA rate limits |

**Cost:** each live search runs about 8–12 web searches plus one long answer, typically 30–120 seconds. Caching keeps repeat lookups free.

## Deploy

The app is a single Node process, so it runs on Render, Railway, Fly.io, a VPS, or any Docker host (`node server.js`). Set the environment variables in your host's dashboard. Proxies must not buffer `text/event-stream` responses. For nginx, add `proxy_buffering off;`.

## Ideas for the next version

- Add login and a per-user search history (e.g. SQLite).
- Pre-build and nightly refresh the most-searched drugs.
- Add a multi-drug interaction checker that takes a list of drugs.
- Add the Cambodian national formulary and DDF registration data as sources.
- Export results as PDF (printing already gives a clean layout).

## Important

This tool is for **healthcare professionals**. AI-generated summaries can contain errors or be out of date. Always check the official product information (SmPC / prescribing information) and local guidelines before prescribing. If you offer it publicly, add terms of use and keep the disclaimer visible. Depending on your jurisdiction, software that supports clinical decisions may be regulated as a medical device.
