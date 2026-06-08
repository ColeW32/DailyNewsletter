/**
 * GET /api/confirm?token=...
 *
 * Verifies the signed double-opt-in token and, on success, adds the contact to
 * the Resend Audience as subscribed. Stateless — no database needed.
 */
import crypto from 'node:crypto';

const SECRET = (process.env.SUBSCRIBE_SECRET || '').trim();
const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const AUDIENCE_ID = (process.env.RESEND_AUDIENCE_ID || '').trim();

function verifyToken(token: string): string | null {
  try {
    const [emailB64, expStr, sig] = token.split('.');
    if (!emailB64 || !expStr || !sig) return null;
    const expected = crypto
      .createHmac('sha256', SECRET)
      .update(`${emailB64}.${expStr}`)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    if (Date.now() > Number(expStr)) return null;
    return Buffer.from(emailB64, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const token = String(req.query?.token || '');
  const email = token && SECRET ? verifyToken(token) : null;

  if (!email) {
    return res
      .status(400)
      .send(page('Link invalid or expired', 'That confirmation link is invalid or has expired. Please subscribe again.'));
  }
  if (!RESEND_API_KEY || !AUDIENCE_ID) {
    return res.status(500).send(page('Not configured', 'The subscribe service isn’t fully set up yet.'));
  }

  const r = await fetch(`https://api.resend.com/audiences/${AUDIENCE_ID}/contacts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, unsubscribed: false }),
  });

  // Treat "already exists" as success too.
  if (!r.ok && r.status !== 409 && r.status !== 422) {
    return res.status(502).send(page('Hmm, that didn’t work', 'We couldn’t confirm you just now — please try again shortly.'));
  }
  return res.status(200).send(page("You're in! 🎉", "You'll get the Survey Club Daily Brief every morning. Welcome aboard."));
}

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
  <body style="margin:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:8% auto;background:#fff;border-radius:16px;overflow:hidden;">
    <div style="background:#000;padding:22px 28px;"><div style="font-size:20px;font-weight:900;color:#fff;">Survey Club</div></div>
    <div style="padding:32px 28px;">
      <h1 style="margin:0 0 10px;font-size:24px;color:#1a1a1a;">${title}</h1>
      <p style="margin:0;font-size:16px;line-height:1.6;color:#3a3a42;">${body}</p>
    </div>
  </div></body></html>`;
}
