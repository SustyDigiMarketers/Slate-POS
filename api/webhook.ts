export interface VercelRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[]>;
  body?: any;
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
    bodyParser: true,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const signature = req.headers['x-razorpay-signature'] as string | undefined;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  // 1. Fail Closed Security Check: Webhook secret must be explicitly configured
  if (!webhookSecret) {
    console.error('[SECURITY ALERT] RAZORPAY_WEBHOOK_SECRET is not configured on server. Failing closed.');
    return res.status(500).json({
      error: 'Security Configuration Error',
      message: 'Server webhook verification secret is unconfigured.',
    });
  }

  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

  // 2. Timing-Safe HMAC-SHA256 Signature Verification
  const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
  if (!isValid) {
    console.warn('[SECURITY] Rejected Razorpay webhook due to invalid HMAC-SHA256 signature.');
    return res.status(400).json({
      error: 'Invalid Signature',
      message: 'Webhook signature verification failed.',
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
