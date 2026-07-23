import { Resend } from 'resend';
import { config } from '../config';
import { todayInET } from '../utils/date';

export async function sendEmail(opts: {
  subject: string;
  html: string;
  to?: string;
}): Promise<string | undefined> {
  const resend = new Resend(config.resendApiKey());
  const to = opts.to ?? config.to;

  const { data, error } = await resend.emails.send({
    from: config.from,
    to,
    subject: opts.subject,
    html: opts.html,
  });

  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
  return data?.id;
}

/** Best-effort failure alert to the admin address. Never throws. */
export async function sendAlert(subject: string, text: string): Promise<void> {
  try {
    const resend = new Resend(config.resendApiKey());
    await resend.emails.send({
      from: config.from,
      to: config.adminEmail,
      subject: `⚠️ Earner's Club Daily: ${subject}`,
      text,
    });
    console.log(`📧 Alert sent to ${config.adminEmail}.`);
  } catch (e) {
    console.log(`(Could not send alert: ${(e as Error).message})`);
  }
}

/**
 * Resend broadcasts run the HTML through a merge-tag ({{ }}) engine. Preserve our
 * merge tags (unsubscribe URL + per-contact EMAIL) and neutralize any other stray
 * braces in the content so the template engine can't choke on them.
 */
function sanitizeBroadcastHtml(html: string): string {
  const TOKENS: Array<[string, string]> = [
    ['{{{RESEND_UNSUBSCRIBE_URL}}}', '__SC_UNSUB__'],
    ['{{{EMAIL}}}', '__SC_EMAIL__'],
  ];
  let s = html;
  for (const [tok, ph] of TOKENS) s = s.split(tok).join(ph);
  s = s.replaceAll('{', '&#123;').replaceAll('}', '&#125;');
  for (const [tok, ph] of TOKENS) s = s.split(ph).join(tok);
  return s;
}

/** POST with retry on 5xx (Resend occasionally returns a transient 500). */
async function resendPost(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  attempts = 5,
): Promise<Response> {
  let res!: Response;
  for (let i = 0; i < attempts; i++) {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (res.ok || res.status < 500) return res; // success or non-retryable client error
    if (i < attempts - 1) {
      console.log(`  ↻ Resend ${res.status} — retrying (${i + 1}/${attempts - 1})...`);
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  return res;
}

/**
 * Create + send a Resend Broadcast to the whole Audience. The HTML must contain
 * the `{{{RESEND_UNSUBSCRIBE_URL}}}` token (the template adds it in broadcast mode).
 * Returns the broadcast id.
 */
export async function sendBroadcast(opts: { subject: string; html: string }): Promise<string | undefined> {
  const apiKey = config.resendApiKey();
  if (!config.audienceId) throw new Error('RESEND_AUDIENCE_ID is not set — cannot broadcast.');
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  const createBody = {
    audience_id: config.audienceId,
    from: config.from,
    subject: opts.subject,
    html: sanitizeBroadcastHtml(opts.html),
    // Resend caps broadcast `name` at 70 chars. The old value interpolated the
    // AI-written subject, which overflowed on long-subject days → 422 → the whole
    // send aborted (e.g. 2026-07-21). The name is just an internal dashboard label,
    // so use the short, unique send date instead — always well under the limit.
    name: `Daily Brief — ${todayInET()}`,
  };
  const createRes = await resendPost('https://api.resend.com/broadcasts', headers, createBody);
  const created: any = await createRes.json().catch(() => ({}));
  if (!createRes.ok) throw new Error(`Broadcast create failed (${createRes.status}): ${JSON.stringify(created)}`);
  const id = created?.id ?? created?.data?.id;
  if (!id) throw new Error(`Broadcast create returned no id: ${JSON.stringify(created)}`);

  const sendRes = await resendPost(`https://api.resend.com/broadcasts/${id}/send`, headers, {});
  if (!sendRes.ok) throw new Error(`Broadcast send failed (${sendRes.status}): ${await sendRes.text()}`);
  return id;
}

/** True if a broadcast was already created today (UTC) — guards against double-sends. */
export async function broadcastSentToday(): Promise<boolean> {
  try {
    const r = await fetch('https://api.resend.com/broadcasts', {
      headers: { Authorization: `Bearer ${config.resendApiKey()}` },
    });
    if (!r.ok) return false;
    const j: any = await r.json();
    const today = new Date().toISOString().slice(0, 10);
    return (j?.data ?? []).some((b: any) => {
      const createdToday = String(b.created_at || '').slice(0, 10) === today;
      const wasSent = b.sent_at != null || ['sent', 'sending'].includes(b.status);
      return createdToday && wasSent; // only an actually-sent broadcast blocks (ignore drafts)
    });
  } catch {
    return false; // on error, don't block the day's send
  }
}
