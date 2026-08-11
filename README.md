# Earner's Club — Daily Newsletter

An AI-written daily newsletter. Each morning a job **collects** data from a set of
sources, Claude **writes** it up in a fun, easy-to-read voice, and it gets **sent**
by email — automatically skipping any section whose data didn't show up that day.

## Sections

| Section | Source | Content |
| --- | --- | --- |
| 🧠 Staying in the Know | TBOY | Top 2 stories |
| 📈 Chart of the Day | Apollo Daily Spark | Chart + why it matters |
| 🌎 Macro News | Seeking Alpha — Wall Street Breakfast | Top macro story |
| 🤖 AI Brief | Ben's Bites / TLDR AI | Top 2 AI stories |
| 📊 Markets Snapshot | Yahoo Finance (→ Polygon/FMP) | S&P 500, Nasdaq, 10Y, Bitcoin, Oil |

## Editions & continuity

- **Mon–Fri:** normal daily brief. The writer is given the last ~7 sent editions
  (pulled from Resend, which stores every broadcast; each email embeds a
  machine-readable `ec-meta` summary of itself) so it never repeats a recent
  subject or re-tells a covered story — follow-ups get "the saga continues"
  framing instead. A too-similar subject triggers an automatic rewrite.
- **Saturday:** week-in-review edition (📅 The Week That Was + 🔮 The Week Ahead),
  recapped from the week's own editions. Weekday sources are stale on weekends
  and are treated as background, never as news.
- **Sunday:** week-ahead edition (🔮 lead + ⚡ ICYMI quick hits), angled away from
  Saturday's recap.
- Same template, header, CTA, and footer on all days — only the content plan changes.
- Testing override: `EDITION_MODE=weekend-sat npm run preview` (or `weekend-sun` / `daily`).

## Stack

- **Node + TypeScript** (run with `tsx`)
- **Claude** (`@anthropic-ai/sdk`) writes the copy
- **Resend** sends the email
- **GitHub Actions** cron runs it daily at 9am (added once the prototype is solid)

## Getting started

```bash
npm install
cp .env.example .env   # then fill in ANTHROPIC_API_KEY and RESEND_API_KEY
```

## Commands

```bash
npm run preview:mock # render the template from raw data (no API keys) → out/
npm run preview      # collect + research + write → out/ (no email sent)
npm run send         # email the last previewed newsletter (out/) to NEWSLETTER_TO
npm run generate     # the full daily run: collect + research + write + send
npm run collect      # fetch + print raw source data (debugging)
npm run typecheck    # type-check the project
```

## Status

✅ **Working end-to-end:** collects 5 sources, researches the thin ones (Haiku +
web search), writes with Claude, renders the Robinhood-styled email, and sends via
Resend. Misbehaving sources are skipped; research falls back gracefully; failures
email an alert.

**Deploy (10:30am ET daily via GitHub Actions):** see [DEPLOY.md](./DEPLOY.md).

**Remaining:** switch from the test-send to a real subscriber list (Resend
Broadcast / Audience) — needs a subscriber CSV + a physical mailing address.
