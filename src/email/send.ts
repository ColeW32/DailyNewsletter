import { Resend } from 'resend';
import { config } from '../config';

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
      subject: `⚠️ Survey Club Daily: ${subject}`,
      text,
    });
    console.log(`📧 Alert sent to ${config.adminEmail}.`);
  } catch (e) {
    console.log(`(Could not send alert: ${(e as Error).message})`);
  }
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

  const createRes = await fetch('https://api.resend.com/broadcasts', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      audience_id: config.audienceId,
      from: config.from,
      subject: opts.subject,
      html: opts.html,
      name: `Daily Brief — ${opts.subject}`,
    }),
  });
  const created: any = await createRes.json().catch(() => ({}));
  if (!createRes.ok) throw new Error(`Broadcast create failed: ${JSON.stringify(created)}`);
  const id = created?.id ?? created?.data?.id;
  if (!id) throw new Error(`Broadcast create returned no id: ${JSON.stringify(created)}`);

  const sendRes = await fetch(`https://api.resend.com/broadcasts/${id}/send`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  if (!sendRes.ok) throw new Error(`Broadcast send failed: ${await sendRes.text()}`);
  return id;
}
