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
git commit -m "Earner's Club daily newsletter"
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

**Actions** tab → **Daily Newsletter** → **Run workflow**. A manual run sends
immediately, so this is your full end-to-end test. The scheduled run fires daily at
**~10:30am ET** — note GitHub's free cron can run 30–90 min late, but the job no
longer skips on a delay, so it will still go out (a broadcast dedup prevents dupes).

## 4. It's live

From then on it sends automatically at **10:30am ET every day** (the two UTC crons
+ the ET guard handle daylight saving for you).

## Going live to subscribers

By default the scheduled run sends to `NEWSLETTER_TO` (you) — test mode. To send to
the whole **Audience** instead, add two **repository variables** (Settings → Secrets
and variables → Actions → **Variables** tab):

| Variable | Value |
| --- | --- |
| `SEND_MODE` | `broadcast` |
| `RESEND_AUDIENCE_ID` | `74e55033-fd6f-482e-ad57-65e4fe798a54` |

The daily run then creates a **Resend Broadcast** to the Audience, with an automatic
unsubscribe link + the mailing address in the footer. Remove the variables (or set
`SEND_MODE` back to `self`) to return to test mode.

## If a run fails

You'll get an email titled **"⚠️ Earner's Club Daily: …"** with the error, and the
Actions run will show red. Common causes: out of Anthropic credits, or a source
site changing its markup (that section just gets skipped).
