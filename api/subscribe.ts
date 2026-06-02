/**
 * POST /api/subscribe   { email }
 *
 * Public, multi-site signup endpoint. Validates the email, then sends a
 * double-opt-in confirmation email with a signed (stateless) link. The contact
 * is only added to the Resend Audience after they click that link (see confirm.ts).
 *
 * Deploy on Vercel. CORS is open (or restricted via ALLOWED_ORIGINS) so the form
 * can be embedded on any of your sites.
 */
import crypto from 'node:crypto';

const SECRET = process.env.SUBSCRIBE_SECRET || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM = process.env.NEWSLETTER_FROM || 'Survey Club Daily <daily@daily.getsurvey.club>';
const CONFIRM_BASE = process.env.CONFIRM_BASE_URL || '';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function applyCors(res: any, origin?: string) {
  const list = process.env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean);
  const allow = !list || list.length === 0 ? '*' : origin && list.includes(origin) ? origin : list[0];
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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
    const honeypot = String(body.company || ''); // bots fill hidden fields

    if (honeypot) return res.status(200).json({ ok: true }); // silently drop bots
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (!SECRET || !RESEND_API_KEY || !CONFIRM_BASE) {
      return res.status(500).json({ error: 'Subscribe endpoint is not configured.' });
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
