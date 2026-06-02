# Deploying the daily 10:30am ET send

The newsletter runs on **GitHub Actions** (free). The workflow is already in the
repo at `.github/workflows/daily.yml`. You just need to put the code on GitHub and
add two secrets.

## 1. Put the code on GitHub

Create a **private** repo (don't initialize it with a README), then from this
folder:

```bash
git init
git add .
git commit -m "Survey Club daily newsletter"
git branch -M main
git remote add origin https://github.com/<you>/survey-club-newsletter.git
git push -u origin main
```

> `.env` is git-ignored, so your API keys are **not** uploaded — they go in as
> repo secrets below.

## 2. Add the two secrets

In the repo: **Settings → Secrets and variables → Actions → New repository secret.**
Add each of these (same values as your local `.env`):

| Name | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | your Anthropic key |
| `RESEND_API_KEY` | your Resend key |

That's it — the `From`, recipient, and 10am-ET guard are baked into the code.

## 3. Test it

**Actions** tab → **Daily Newsletter** → **Run workflow**. A manual run **sends
immediately** (it bypasses the time guard), so this is your full end-to-end test —
check your inbox. Scheduled runs, by contrast, only send at **10:30am ET**.

## 4. It's live

From then on it sends automatically at **10:30am ET every day** (the two UTC crons
+ the ET guard handle daylight saving for you).

## Current recipient

Until we wire up the real subscriber list, the scheduled run sends to
`NEWSLETTER_TO` (your address). When you're ready, we switch it to a **Resend
Broadcast** to your Audience (with automatic unsubscribes) — that needs your
subscriber CSV + a physical mailing address for the footer.

## If a run fails

You'll get an email titled **"⚠️ Survey Club Daily: …"** with the error, and the
Actions run will show red. Common causes: out of Anthropic credits, or a source
site changing its markup (that section just gets skipped).
