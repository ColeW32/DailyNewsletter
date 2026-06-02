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
