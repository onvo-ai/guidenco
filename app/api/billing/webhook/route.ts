import { NextResponse } from 'next/server';
import { stripe, PLANS, CREDIT_PACK_SIZE } from '@/lib/billing';
import { db } from '@/lib/db';
import { subscriptions, credits } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import type Stripe from 'stripe';


async function upsertCredits(organizationId: string, newBalance: number) {
  const [existing] = await db
    .select()
    .from(credits)
    .where(eq(credits.organizationId, organizationId))
    .limit(1);

  if (existing) {
    await db
      .update(credits)
      .set({ balance: newBalance, lastResetAt: new Date(), updatedAt: new Date() })
      .where(eq(credits.organizationId, organizationId));
  } else {
    await db.insert(credits).values({
      organizationId,
      balance: newBalance,
      lastResetAt: new Date(),
    });
  }
}

async function addCredits(organizationId: string, amount: number) {
  const [existing] = await db
    .select()
    .from(credits)
    .where(eq(credits.organizationId, organizationId))
    .limit(1);

  if (existing) {
    await db
      .update(credits)
      .set({ balance: sql`${credits.balance} + ${amount}`, updatedAt: new Date() })
      .where(eq(credits.organizationId, organizationId));
  } else {
    await db.insert(credits).values({ organizationId, balance: amount });
  }
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature or webhook secret' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const checkoutSession = event.data.object as Stripe.Checkout.Session;
        const organizationId = checkoutSession.metadata?.organizationId;
        if (!organizationId) break;

        if (checkoutSession.mode === 'subscription') {
          // Subscription started — handled more fully in subscription events below
          // Just ensure the row exists with the customer id
          const stripeSubscriptionId = checkoutSession.subscription as string;
          const stripeCustomerId = checkoutSession.customer as string;

          const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          const priceId = stripeSub.items.data[0]?.price.id;
          const currentPeriodEnd = new Date(stripeSub.items.data[0].current_period_end * 1000);

          const [existing] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.organizationId, organizationId))
            .limit(1);

          if (existing) {
            await db
              .update(subscriptions)
              .set({
                stripeCustomerId,
                stripeSubscriptionId,
                stripePriceId: priceId,
                plan: 'pro',
                status: 'active',
                currentPeriodEnd,
                cancelAtPeriodEnd: false,
                updatedAt: new Date(),
              })
              .where(eq(subscriptions.organizationId, organizationId));
          } else {
            await db.insert(subscriptions).values({
              organizationId,
              stripeCustomerId,
              stripeSubscriptionId,
              stripePriceId: priceId,
              plan: 'pro',
              status: 'active',
              currentPeriodEnd,
              cancelAtPeriodEnd: false,
            });
          }

          // Grant pro credits
          await upsertCredits(organizationId, PLANS.pro.credits);
        } else if (checkoutSession.mode === 'payment' && checkoutSession.metadata?.type === 'credits') {
          // One-time credit pack purchase
          await addCredits(organizationId, CREDIT_PACK_SIZE);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const stripeSub = event.data.object as Stripe.Subscription;
        const organizationId = stripeSub.metadata?.organizationId;
        if (!organizationId) break;

        const priceId = stripeSub.items.data[0]?.price.id;
        const productId = stripeSub.items.data[0]?.price.product as string | undefined;
        const isProProduct = productId === process.env.STRIPE_PRO_PRODUCT_ID;
        const plan = isProProduct ? 'pro' : 'free';
        const currentPeriodEnd = new Date(stripeSub.items.data[0].current_period_end * 1000);

        await db
          .update(subscriptions)
          .set({
            stripePriceId: priceId,
            plan,
            status: stripeSub.status,
            currentPeriodEnd,
            cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.stripeSubscriptionId, stripeSub.id));
        break;
      }

      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object as Stripe.Subscription;

        await db
          .update(subscriptions)
          .set({
            plan: 'free',
            status: 'canceled',
            stripeSubscriptionId: null,
            stripePriceId: null,
            cancelAtPeriodEnd: false,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.stripeSubscriptionId, stripeSub.id));

        // Find user and reset to free credits
        const [sub] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.stripeCustomerId, stripeSub.customer as string))
          .limit(1);

        if (sub) {
          await upsertCredits(sub.organizationId, PLANS.free.credits);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        // Reset credits on subscription renewal (not the first invoice)
        if ((invoice as any).billing_reason === 'subscription_cycle') {
          const stripeSubscriptionId = (invoice as any).subscription as string;
          const [sub] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
            .limit(1);

          if (sub && sub.plan === 'pro') {
            await upsertCredits(sub.organizationId, PLANS.pro.credits);
          }
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
