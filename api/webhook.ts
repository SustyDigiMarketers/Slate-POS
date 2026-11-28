export interface VercelRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[]>;
  body?: any;
  rawBody?: string | Buffer;
  [Symbol.asyncIterator]?: () => AsyncIterator<Buffer | string>;
}

export interface VercelResponse {
  status: (statusCode: number) => VercelResponse;
  json: (body: any) => VercelResponse;
  send: (body: any) => VercelResponse;
  setHeader: (name: string, value: string | string[]) => VercelResponse;
  end: () => void;
}

import {
  verifyWebhookSignature,
  recordWebhookDurable,
  transitionSubscriptionState,
  getServerSupabase,
} from '../src/lib/subscriptionServer';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function collectRawBody(req: VercelRequest): Promise<string> {
  if (typeof req.rawBody === 'string') return req.rawBody;
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString('utf8');
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');

  if (typeof req[Symbol.asyncIterator] === 'function') {
    const chunks: Buffer[] = [];
    for await (const chunk of req as AsyncIterable<Buffer | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8'));
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  return req.body ? JSON.stringify(req.body) : '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const signature = (req.headers['x-razorpay-signature'] || req.headers['X-Razorpay-Signature']) as string | undefined;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  // 1. Fail Closed Security Check: Webhook secret must be explicitly configured
  if (!webhookSecret) {
    console.error('[SECURITY ALERT] RAZORPAY_WEBHOOK_SECRET is not configured on server. Failing closed.');
    return res.status(500).json({
      error: 'Security Configuration Error',
      message: 'Server webhook verification secret is unconfigured.',
    });
  }

  const rawBody = await collectRawBody(req);
  if (!rawBody) {
    return res.status(400).json({
      error: 'Empty Payload',
      message: 'Webhook request body is empty.',
    });
  }

  // 2. Timing-Safe HMAC-SHA256 Signature Verification on EXACT raw payload bytes
  const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
  if (!isValid) {
    console.warn('[SECURITY] Rejected Razorpay webhook due to invalid HMAC-SHA256 signature.');
    return res.status(400).json({
      error: 'Invalid Signature',
      message: 'Webhook signature verification failed.',
    });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({
      error: 'Invalid JSON',
      message: 'Webhook payload could not be parsed as valid JSON.',
    });
  }

  // 3. Extract Authoritative Gateway Event Identifiers
  const eventId =
    event.id ||
    event.payload?.payment?.entity?.id ||
    event.payload?.subscription?.entity?.id ||
    `wh_${Date.now()}`;
  const eventType = event.event;

  // 4. Durable Idempotency Check in PostgreSQL payment_webhook_events
  const idempotency = await recordWebhookDurable(eventId, eventType, event);
  if (idempotency.alreadyProcessed) {
    return res.status(200).json({
      status: 'already_processed',
      message: 'Event was already recorded and processed.',
      eventId,
    });
  }

  // 5. Subscription Lifecycle Transition
  const stateTransition = transitionSubscriptionState('PENDING', eventType);
  const orgId =
    event.payload?.payment?.entity?.notes?.organizationId ||
    event.payload?.subscription?.entity?.notes?.organizationId ||
    event.payload?.order?.entity?.notes?.organizationId;
  const planId =
    event.payload?.payment?.entity?.notes?.planId ||
    event.payload?.subscription?.entity?.plan_id ||
    'plan_growth_monthly';
  const amountPaisa =
    event.payload?.payment?.entity?.amount ||
    event.payload?.order?.entity?.amount ||
    0;
  const amountInr = Math.round(amountPaisa / 100);
  const taxInr = Math.round(amountInr * (18 / 118)); // Extract 18% GST component
  const paymentId = event.payload?.payment?.entity?.id || `pay_${eventId.slice(0, 16)}`;
  const subId = event.payload?.subscription?.entity?.id || `sub_${eventId.slice(0, 16)}`;

  // 6. Execute Atomic PostgreSQL RPC Procedure
  const supabase = getServerSupabase();
  if (supabase && orgId) {
    try {
      await supabase.rpc('process_subscription_webhook_atomic', {
        p_event_id: eventId,
        p_event_type: eventType,
        p_org_id: orgId,
        p_plan_id: planId,
        p_provider_sub_id: subId,
        p_amount: amountInr,
        p_tax: taxInr,
        p_period_days: planId.includes('annual') ? 365 : 30,
        p_raw_payload: event,
      });
    } catch (rpcErr) {
      console.error('Failed to execute process_subscription_webhook_atomic:', rpcErr);
    }
  }

  return res.status(200).json({
    status: 'success',
    received: true,
    eventId,
    eventType,
    subscriptionStatus: stateTransition.newStatus,
  });
}
