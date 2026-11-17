// Razorpay Subscriptions: the real checkout behind the Premium upgrade. Plain fetch, no extra library.
// Everything is read from environment variables. Until they are set, KidLog falls back to its demo checkout.
// With test keys (rzp_test_...) Razorpay runs in test mode: the same flow, but no real money moves.
import crypto from 'node:crypto';

const env = (k) => (process.env[k] || '').trim();
const plans = () => ({ monthly: env('RAZORPAY_PLAN_MONTHLY'), yearly: env('RAZORPAY_PLAN_YEARLY') });

export const enabled = () => !!(env('RAZORPAY_KEY_ID') && env('RAZORPAY_KEY_SECRET') && plans().monthly && plans().yearly);
export const testMode = () => env('RAZORPAY_KEY_ID').startsWith('rzp_test_');
export const keyId = () => env('RAZORPAY_KEY_ID');
export const periodOfPlan = (planId) => (planId && planId === plans().yearly ? 'yearly' : 'monthly');

// How many billing cycles a subscription runs before Razorpay ends it: ten years either way.
const CYCLES = { monthly: 120, yearly: 10 };

async function api(method, path, body) {
  const r = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${env('RAZORPAY_KEY_ID')}:${env('RAZORPAY_KEY_SECRET')}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.description || `Razorpay answered ${r.status}`);
  return data;
}

// Step 1 of a payment: a subscription the parent then pays for in Razorpay's checkout.
export async function createSubscription(period, space) {
  const p = period === 'yearly' ? 'yearly' : 'monthly';
  const sub = await api('POST', '/subscriptions', {
    plan_id: plans()[p], total_count: CYCLES[p], customer_notify: 1, notes: { kidlog_family: String(space.id) },
  });
  return { id: sub.id, period: p };
}

export async function cancelSubscription(id) {
  return api('POST', `/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: 0 });
}

const hmac = (text, secret) => crypto.createHmac('sha256', secret).update(text).digest('hex');
const same = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Step 2: the browser reports a payment. It is genuine only if Razorpay signed it with our key secret.
// The subscription id must be the one we stored, never one sent by the browser.
export const validPayment = ({ paymentId, subscriptionId, signature }) =>
  !!paymentId && !!subscriptionId && !!signature && same(hmac(`${paymentId}|${subscriptionId}`, env('RAZORPAY_KEY_SECRET')), signature);

// Razorpay also calls our webhook; that request is genuine only if it is signed with the webhook secret.
export const validWebhook = (rawBody, signature) =>
  !!env('RAZORPAY_WEBHOOK_SECRET') && !!rawBody && !!signature && same(hmac(rawBody, env('RAZORPAY_WEBHOOK_SECRET')), signature);

// Which plan a webhook event leaves the family on. Events not listed here change nothing.
export const PLAN_AFTER = {
  'subscription.activated': 'premium',
  'subscription.charged': 'premium',
  'subscription.halted': 'free',     // every retry of a failed renewal has failed
  'subscription.cancelled': 'free',
  'subscription.completed': 'free',
  'subscription.expired': 'free',
};
