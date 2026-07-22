# Earner's Club Daily — Subscribe API (Partner Integration)

Add a "Subscribe to **Earner's Club Daily**" box to your app. The reader enters their
email, taps **Subscribe**, and we email them a one-click confirmation link. Once they
click it, they're subscribed. You build the UI; we handle sending, confirmation, and
unsubscribes.

- **No API key required.** The endpoint is public and safe to call from a browser or your server.
- **Double opt-in.** A contact is only added after they click the confirmation link in their inbox. This keeps deliverability high and the list clean.
- **One call.** `POST` an email, show a "check your inbox" message, done.

---

## Endpoint

```
POST https://daily-newsletter-one.vercel.app/api/subscribe
Content-Type: application/json
```

### Request body

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `email` | string | ✅ | The subscriber's email address. |
| `company` | string | optional | **Honeypot.** Include a hidden, empty field named `company`. Real users leave it blank; bots that auto-fill it are silently dropped. Send `""`. |
| `t` | number | optional | Milliseconds the form was on screen before submit. If you send a value **under 1500ms**, we treat it as a bot and silently drop it. Only send `t` if you're measuring real fill time; otherwise omit it. |

Any extra fields are ignored.

### Responses

| Status | Body | Meaning |
| --- | --- | --- |
| `200` | `{ "ok": true, "message": "Almost there — check your inbox to confirm." }` | Accepted — confirmation email sent. (Also the response for a silently-dropped bot, so you can always show the same friendly message.) |
| `400` | `{ "error": "..." }` | Invalid, disposable, or non-deliverable email (no MX record). Show the error to the user. |
| `403` | `{ "error": "Forbidden." }` | Only if origin restrictions are enabled and your domain isn't allow-listed (see [CORS](#cors--browser-use)). |
| `429` | `{ "error": "..." }` | Rate limited — back off and retry shortly. |
| `5xx` | `{ "error": "..." }` | Temporary issue on our side — retry shortly. |

---

## How it works

```
[ your UI: email + Subscribe ]
      │  POST /api/subscribe { email }
      ▼
[ Earner's Club ] ── validates, blocks spam, sends a confirmation email
      │
      ▼
[ subscriber clicks the link in their inbox ]
      │
      ▼
[ confirmed + added to the list ]  ✅  (they start getting the Daily Brief)
```

Your job ends at the `POST`. We send the confirmation email and handle the rest
(confirmation page, unsubscribes, delivery).

---

## A) Drop-in HTML form (no framework)

Paste this anywhere. Restyle freely — just keep the hidden `company` field and the `t` timing value.

```html
<form id="sc-subscribe" style="display:flex;gap:8px;max-width:420px;">
  <input type="email" name="email" required placeholder="you@email.com"
         style="flex:1;padding:12px;border:1px solid #ccc;border-radius:8px;font-size:16px;">
  <!-- honeypot: keep hidden + empty -->
  <input type="text" name="company" tabindex="-1" autocomplete="off"
         style="position:absolute;left:-9999px;" aria-hidden="true">
  <button type="submit"
          style="padding:12px 18px;background:#00C805;color:#000;font-weight:700;border:none;border-radius:8px;cursor:pointer;">
    Subscribe
  </button>
</form>
<p id="sc-msg" style="font-size:14px;margin-top:8px;"></p>
<script>
(function () {
  var ENDPOINT = "https://daily-newsletter-one.vercel.app/api/subscribe";
  var loadedAt = Date.now();
  var f = document.getElementById("sc-subscribe"), m = document.getElementById("sc-msg");
  f.addEventListener("submit", async function (e) {
    e.preventDefault();
    m.textContent = "…";
    try {
      var res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: f.email.value,
          company: f.company.value,      // honeypot
          t: Date.now() - loadedAt        // fill time
        })
      });
      var data = await res.json();
      m.textContent = res.ok ? "✅ Check your inbox to confirm!" : (data.error || "Something went wrong.");
      if (res.ok) f.reset();
    } catch (_) { m.textContent = "Network error — please try again."; }
  });
})();
</script>
```

## B) Browser fetch (React / any JS UI)

```js
async function subscribe(email) {
  const res = await fetch("https://daily-newsletter-one.vercel.app/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, company: "" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Subscribe failed");
  return data.message; // "Almost there — check your inbox to confirm."
}
```

## C) Server-side

**cURL**
```bash
curl -X POST https://daily-newsletter-one.vercel.app/api/subscribe \
  -H "Content-Type: application/json" \
  -d '{"email":"you@email.com"}'
```

**Node (fetch)**
```js
const res = await fetch("https://daily-newsletter-one.vercel.app/api/subscribe", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email }),
});
const data = await res.json();
if (!res.ok) throw new Error(data.error);
```

**Python (requests)**
```python
import requests
r = requests.post(
    "https://daily-newsletter-one.vercel.app/api/subscribe",
    json={"email": email},
    timeout=10,
)
data = r.json()
if not r.ok:
    raise RuntimeError(data.get("error", "subscribe failed"))
```

---

## Recommended UX

1. On submit, call the endpoint and disable the button.
2. On `200` → show **"Check your inbox to confirm your subscription."** (Don't claim "Subscribed!" yet — they still need to click the link.)
3. On `400` → show the returned `error` (e.g., invalid email).
4. On network / `5xx` → "Something went wrong, please try again."

---

## CORS / browser use

**Browser** requests are checked against an origin allow-list when one is configured:
requests from non-approved domains return `403` — send us the origin(s) you'll call from
(e.g. `https://yourapp.com`) and we'll add them. Requests **without** an `Origin` header —
native mobile apps, server-to-server, curl — are always accepted; origin checks only
apply to browsers. (Anti-spam layers 1 and 3–6 cover origin-less traffic.)

## Notes & FAQ

- **No API key / secret needed** — nothing sensitive lives in your app.
- **Idempotent** — re-submitting the same email is safe (they just get another confirm link if not yet confirmed).
- **Spam handling is built in** — disposable domains and undeliverable addresses are rejected; the honeypot + timing fields catch bots; double opt-in protects the list. Including the `company` honeypot and `t` timing fields from a browser form is recommended but optional.
- **Unsubscribes** are handled by us (every issue has a one-click unsubscribe).
- **Custom domain** — if we move the endpoint to e.g. `https://subscribe.getsurvey.club`, only the base URL changes; the request/response shape stays identical.
- **Want referral attribution** (to know which app sent a subscriber)? Reach out — we can enable a per-source tag.

## Support

Questions or want your domain allow-listed? Contact **daily@daily.getsurvey.club**.
