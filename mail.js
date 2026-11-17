// Sends email through Resend (https://resend.com) with plain fetch. Used only for vaccine reminders.
// Needs RESEND_API_KEY and EMAIL_FROM, an address on a domain verified in Resend, e.g. "KidLog <reminders@yourdomain>".
const env = (k) => (process.env[k] || '').trim();

export const enabled = () => !!(env('RESEND_API_KEY') && env('EMAIL_FROM'));

export async function send({ to, subject, text, html }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('EMAIL_FROM'), to: [to], subject, text, html }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data?.message || `Resend answered ${r.status}`);
  }
}
