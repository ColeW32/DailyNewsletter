/**
 * POST /api/subscribe   { email, company?, t? }
 *
 * Public, multi-site signup endpoint with layered anti-spam. Valid signups get a
 * double-opt-in confirmation email; the contact only joins the Audience after they
 * click the link (see confirm.ts).
 *
 * Anti-spam layers (no CAPTCHA required):
 *   1. Honeypot ("company") — hidden field; if filled → silent drop.
 *   2. Origin allowlist — if ALLOWED_ORIGINS set, reject other origins.
 *   3. Submit timing ("t" = ms on screen) — sub-1.5s submits → silent drop.
 *   4. Disposable-domain blocklist.
 *   5. MX check — domain must be able to receive mail.
 *   6. Double opt-in — nothing joins the list until the emailed link is clicked.
 */
import crypto from 'node:crypto';
import { resolveMx, resolve } from 'node:dns/promises';

const SECRET = (process.env.SUBSCRIBE_SECRET || '').trim();
const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const FROM = (process.env.NEWSLETTER_FROM || 'Survey Club Daily <daily@daily.getsurvey.club>').trim();
const CONFIRM_BASE = (process.env.CONFIRM_BASE_URL || '').trim();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Common disposable / throwaway domains. Blocks the bulk of junk signups.
const DISPOSABLE = new Set([
  '0-mail.com', '10minutemail.com', '20minutemail.com', '33mail.com', 'anonbox.net',
  'binkmail.com', 'bobmail.info', 'bugmenot.com', 'burnermail.io', 'crazymailing.com',
  'discard.email', 'discardmail.com', 'dispostable.com', 'dropmail.me', 'emailondeck.com',
  'fakeinbox.com', 'fakemail.net', 'fakemailgenerator.com', 'getairmail.com', 'getnada.com',
  'grr.la', 'guerrillamail.biz', 'guerrillamail.com', 'guerrillamail.de', 'guerrillamail.info',
  'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com', 'harakirimail.com', 'inboxbear.com',
  'inboxkitten.com', 'jetable.org', 'mailcatch.com', 'maildrop.cc', 'mailde.de',
  'maileater.com', 'mailexpire.com', 'mailforspam.com', 'mailinator.com', 'mailinator.net',
  'mailnesia.com', 'mailnull.com', 'mailsac.com', 'mailtemp.net', 'mailtothis.com',
  'meltmail.com', 'mintemail.com', 'moakt.com', 'mohmal.com', 'mvrht.com',
  'mytemp.email', 'nada.email', 'nowmymail.com', 'objectmail.com', 'oneoffmail.com',
  'pokemail.net', 'sharklasers.com', 'spam4.me', 'spambog.com', 'spambox.us',
  'spamdecoy.net', 'spamgourmet.com', 'tafmail.com', 'tempail.com', 'tempemail.com',
  'tempinbox.com', 'tempmail.com', 'tempmail.net', 'tempmailo.com', 'temp-mail.org',
  'tempr.email', 'throwaway.email', 'throwawaymail.com', 'tmpmail.net', 'tmpmail.org',
  'trashmail.com', 'trashmail.de', 'trashmail.net', 'trbvm.com', 'vomoto.com',
  'wegwerfmail.de', 'yopmail.com', 'yopmail.fr', 'yopmail.net', 'zetmail.com',
]);

function originList(): string[] | null {
  const list = process.env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean);
  return list && list.length ? list : null;
}

function applyCors(res: any, origin?: string) {
  const list = originList();
  const allow = !list ? '*' : origin && list.includes(origin) ? origin : list[0];
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function domainCanReceiveMail(domain: string): Promise<boolean> {
  try {
    const mx = (await Promise.race([
      resolveMx(domain),
      new Promise((_, rej) => setTimeout(() => rej(new Error('dns timeout')), 3000)),
    ])) as { exchange: string }[];
    if (mx && mx.length > 0) return true;
    const a = await resolve(domain).catch(() => [] as string[]);
    return Array.isArray(a) && a.length > 0;
  } catch {
    return true; // DNS hiccup → fail open (never reject a real user on a transient error)
  }
}

function signToken(email: string): string {
  const exp = Date.now() + 1000 * 60 * 60 * 48; // 48h
  const payload = `${Buffer.from(email).toString('base64url')}.${exp}`;
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export default async function handler(req: any, res: any) {
  applyCors(res, req.headers?.origin);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const honeypot = String(body.company || '');
    const elapsed = Number(body.t);

    // 1. Honeypot — real users never fill the hidden field.
    if (honeypot) return res.status(200).json({ ok: true });
    // 2. Origin allowlist (if configured) — block browser calls from other sites.
    //    Only enforced when an Origin header is present: native apps and
    //    server-to-server clients don't send one (and anything outside a browser
    //    can forge headers, so origin gating only defends against cross-site
    //    browser abuse anyway — layers 1 and 3-6 still cover origin-less traffic).
    const list = originList();
    const origin = req.headers?.origin;
    if (list && origin && !list.includes(origin)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    // 3. Too-fast submit — bots fill + submit in milliseconds.
    if (Number.isFinite(elapsed) && elapsed > 0 && elapsed < 1500) {
      return res.status(200).json({ ok: true });
    }

    if (email.length > 254 || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!SECRET || !RESEND_API_KEY || !CONFIRM_BASE) {
      return res.status(500).json({ error: 'Subscribe endpoint is not configured.' });
    }

    const domain = email.split('@')[1];
    // 4. Disposable / throwaway domains.
    if (DISPOSABLE.has(domain)) {
      return res.status(400).json({ error: 'Please use a permanent (non-disposable) email address.' });
    }
    // 5. Domain must actually be able to receive mail (catches typos + fake domains).
    if (!(await domainCanReceiveMail(domain))) {
      return res.status(400).json({ error: 'That email domain can’t receive mail — double-check the spelling.' });
    }

    const token = signToken(email);
    const confirmUrl = `${CONFIRM_BASE.replace(/\/$/, '')}/api/confirm?token=${encodeURIComponent(token)}`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: email,
        subject: 'Confirm your Survey Club Daily subscription',
        html: confirmEmailHtml(confirmUrl),
      }),
    });
    if (!r.ok) {
      return res.status(502).json({ error: 'Could not send the confirmation email. Try again shortly.' });
    }
    return res.status(200).json({ ok: true, message: 'Almost there — check your inbox to confirm.' });
  } catch {
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

function confirmEmailHtml(url: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;"><tr><td align="center" style="padding:32px 12px;">
  <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:520px;max-width:100%;background:#fff;border-radius:16px;overflow:hidden;">
    <tr><td style="background:#000;padding:24px 28px;"><div style="font-size:20px;font-weight:900;color:#fff;">Survey Club</div></td></tr>
    <tr><td style="padding:28px;">
      <h1 style="margin:0 0 12px;font-size:22px;color:#1a1a1a;">One quick tap to confirm</h1>
      <p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#3a3a42;">Tap below to confirm your subscription to the <strong>Survey Club Daily Brief</strong> — markets, business &amp; AI, written to actually be fun. If you didn't request this, just ignore this email.</p>
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#00C805" style="border-radius:999px;">
        <a href="${url}" style="display:inline-block;padding:15px 30px;font-size:16px;font-weight:800;color:#000;text-decoration:none;">Confirm my subscription →</a>
      </td></tr></table>
      <p style="margin:22px 0 0;font-size:12px;color:#8a9099;">This link expires in 48 hours.</p>
    </td></tr>
  </table></td></tr></table></body></html>`;
}
