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
Replace `SUBSCRIBE_URL` with your deployed origin. Restyle however you like — only
the `fetch` URL and the hidden honeypot field matter.

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
  var SUBSCRIBE_URL = "https://subscribe.getsurvey.club/api/subscribe"; // <-- your deployed URL
  var f = document.getElementById("sc-subscribe"), m = document.getElementById("sc-msg");
  f.addEventListener("submit", async function (e) {
    e.preventDefault();
    m.textContent = "…";
    try {
      var res = await fetch(SUBSCRIBE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: f.email.value, company: f.company.value }),
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
POST https://subscribe.getsurvey.club/api/subscribe
Content-Type: application/json

{ "email": "you@email.com" }
```
Responses:
```
200  { "ok": true, "message": "Almost there — check your inbox to confirm." }
400  { "error": "Please enter a valid email address." }
```
Then the user clicks the confirm link in their inbox and they're added to the list.
(That's it — no API key needed by the embedding site; the key lives only on the
server.)

## Recommended hardening
Because the form is public, add an invisible CAPTCHA (e.g. **Cloudflare Turnstile**)
to block email-bombing — the form gets a token, `subscribe.ts` verifies it. Easy to
add when you want it. (Double opt-in already keeps the *list* clean; this just
protects your send quota.)

## Last step: send to the Audience
Once subscribers are flowing in, we switch the daily 10:30am job from "send to you"
to a **Resend Broadcast** to this Audience (with the auto unsubscribe link + your
physical mailing address in the footer).
