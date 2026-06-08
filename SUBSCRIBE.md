# Letting people subscribe (multi-site)

One small hosted service powers signups across **all** your sites. Each site can use
either:

- **A) the paste-in embed form** — drop in some HTML, restyle freely, done.
- **B) the raw JSON API** — build your own UI and POST the email yourself.

Both hit the same endpoint, so your Resend key stays server-side and every signup
goes through the same **double opt-in** (a confirm-link email) into your Resend
Audience. The daily Broadcast then goes to that Audience.

```
[ any site's form ] --POST email--> /api/subscribe --sends confirm email-->
        user clicks link --> /api/confirm --> added to Resend Audience ✅
```

## What's in the repo
- `api/subscribe.ts` — `POST /api/subscribe` (validates email, sends confirm email)
- `api/confirm.ts` — `GET /api/confirm?token=...` (verifies link, adds to Audience)

Both are serverless functions; **deploy on Vercel** (GitHub Actions can't host an
always-on endpoint).

## Deploy (≈10 min)
1. **Create a Resend Audience:** Resend dashboard → Audiences → New. Copy its **ID**.
2. **Import this repo into Vercel** (vercel.com → Add New → Project → pick the repo).
   Vercel auto-detects the `api/` functions.
3. **Set Vercel env vars** (Project → Settings → Environment Variables):

| Var | Value |
| --- | --- |
| `RESEND_API_KEY` | your Resend key |
| `RESEND_AUDIENCE_ID` | the Audience ID from step 1 |
| `SUBSCRIBE_SECRET` | a random string (`openssl rand -hex 32`) |
| `NEWSLETTER_FROM` | `Survey Club Daily <daily@daily.getsurvey.club>` |
| `CONFIRM_BASE_URL` | your deployed URL, e.g. `https://subscribe.getsurvey.club` |
| `ALLOWED_ORIGINS` | *(optional)* CSV of site origins; omit to allow all |

4. *(Optional)* point a subdomain like `subscribe.getsurvey.club` at the Vercel project.

## A) Embed form (paste into any site)
Pre-filled with your live endpoint. Restyle however you like — just keep the hidden
honeypot field and the `t` (timing) value, which power the anti-spam checks.

```html
<form id="sc-subscribe" style="display:flex;gap:8px;max-width:420px;">
  <input type="email" name="email" required placeholder="you@email.com"
         style="flex:1;padding:12px;border:1px solid #ccc;border-radius:8px;font-size:16px;">
  <input type="text" name="company" tabindex="-1" autocomplete="off"
         style="position:absolute;left:-9999px;" aria-hidden="true"><!-- honeypot, leave empty -->
  <button type="submit"
          style="padding:12px 18px;background:#00C805;color:#000;font-weight:700;border:none;border-radius:8px;cursor:pointer;">
    Subscribe
  </button>
</form>
<p id="sc-msg" style="font-size:14px;margin-top:8px;"></p>
<script>
(function () {
  var SUBSCRIBE_URL = "https://daily-newsletter-one.vercel.app/api/subscribe";
  var loadedAt = Date.now();
  var f = document.getElementById("sc-subscribe"), m = document.getElementById("sc-msg");
  f.addEventListener("submit", async function (e) {
    e.preventDefault();
    m.textContent = "…";
    try {
      var res = await fetch(SUBSCRIBE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: f.email.value, company: f.company.value, t: Date.now() - loadedAt }),
      });
      var data = await res.json();
      m.textContent = res.ok ? "✅ Check your inbox to confirm!" : (data.error || "Something went wrong.");
      if (res.ok) f.reset();
    } catch (_) { m.textContent = "Network error — please try again."; }
  });
})();
</script>
```

## B) Raw API (build your own UI)
```
POST https://daily-newsletter-one.vercel.app/api/subscribe
Content-Type: application/json

{ "email": "you@email.com", "t": 4200 }
```
*(`t` = milliseconds the form was on screen before submit — optional but recommended; it powers the timing anti-spam check. Also send an empty hidden `company` field as a honeypot if you can.)*
Responses:
```
200  { "ok": true, "message": "Almost there — check your inbox to confirm." }
400  { "error": "Please enter a valid email address." }
```
Then the user clicks the confirm link in their inbox and they're added to the list.
(That's it — no API key needed by the embedding site; the key lives only on the
server.)

## Anti-spam (built in)
The endpoint runs several layers before it ever sends a confirmation email:
- **Honeypot** — a hidden `company` field; if filled, the signup is silently dropped.
- **Submit-timing** — the embed sends `t` (ms on screen); sub-1.5s submits (bots) are silently dropped.
- **Disposable-domain block** — known throwaway domains (mailinator, guerrillamail, …) are rejected.
- **MX check** — the email's domain must actually be able to receive mail (kills typos + fake domains).
- **Origin allowlist** — set `ALLOWED_ORIGINS` (CSV of your sites' origins) and the endpoint rejects POSTs from anywhere else. **Strongly recommended** once you know your embed domains.
- **Double opt-in** — nothing joins the Audience until the emailed link is clicked.

Together these stop the large majority of junk. The one remaining gap is *volumetric*
abuse (scripting thousands of requests to burn your send quota) — for that add
**Cloudflare Turnstile** (planned) or an IP rate-limiter (e.g. Upstash KV).

## Newsletter recommendations (SparkLoop Upscribe 💸)
After someone confirms, the **confirmation page** (`api/confirm.ts`) loads SparkLoop's
Upscribe widget and fires it for the confirmed email
(`window.SL.trackSubscriber(email)`) using publication `pub_146b410876ab`. They get a
one-click list of recommended newsletters; you earn per subscribe.

**Optional — also show it the instant they hit Subscribe** (on your site's form page).
Add the script once to the page:
```html
<script async src="https://js.sparkloop.app/embed.js?publication_id=pub_146b410876ab" data-sparkloop></script>
```
…and in the embed snippet's success branch (right after `f.reset()`), add:
```js
if (window.SL && window.SL.trackSubscriber) window.SL.trackSubscriber(f.email.value);
```
SparkLoop dedupes by email, so showing it on both the form and the confirm page is fine.

## Last step: send to the Audience
Once subscribers are flowing in, we switch the daily 10:30am job from "send to you"
to a **Resend Broadcast** to this Audience (with the auto unsubscribe link + your
physical mailing address in the footer).
