import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { subscriptions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { stripe } from '@/lib/billing';

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { type } = await req.json(); // 'subscription' | 'credits'
    const userId = session.user.id;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    // Get existing subscription record for stripeCustomerId
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    let stripeCustomerId = sub?.stripeCustomerId;

    // Create a Stripe customer if we don't have one yet
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: session.user.email,
        name: session.user.name,
        metadata: { userId },
      });
      stripeCustomerId = customer.id;

      // Upsert subscription row with the new customer id
      if (sub) {
        await db
          .update(subscriptions)
          .set({ stripeCustomerId, updatedAt: new Date() })
          .where(eq(subscriptions.userId, userId));
      } else {
        await db.insert(subscriptions).values({
          userId,
          stripeCustomerId,
          plan: 'free',
          status: 'active',
        });
      }
    }

    if (type === 'subscription') {
      const productId = process.env.STRIPE_PRO_PRODUCT_ID;
      if (!productId) {
        return NextResponse.json({ error: 'Pro plan not configured' }, { status: 500 });
      }

      const prices = await stripe.prices.list({ product: productId, active: true, limit: 1 });
      const price = prices.data[0];
      if (!price) {
        return NextResponse.json({ error: 'No active price found for Pro plan' }, { status: 500 });
      }

      const checkoutSession = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: stripeCustomerId,
        line_items: [{ price: price.id, quantity: 1 }],
        success_url: `${appUrl}/app?billing=success`,
        cancel_url: `${appUrl}/app?billing=canceled`,
        metadata: { userId },
        subscription_data: { metadata: { userId } },
      });

      return NextResponse.json({ url: checkoutSession.url });
    }

    if (type === 'credits') {
      const productId = process.env.STRIPE_CREDIT_PACK_PRODUCT_ID;
      if (!productId) {
        return NextResponse.json({ error: 'Credit packs not configured' }, { status: 500 });
      }

      const prices = await stripe.prices.list({ product: productId, active: true, limit: 1 });
      const price = prices.data[0];
      if (!price) {
        return NextResponse.json({ error: 'No active price found for credit pack' }, { status: 500 });
      }

      const checkoutSession = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: stripeCustomerId,
        line_items: [{ price: price.id, quantity: 1 }],
        success_url: `${appUrl}/app?billing=credits_added`,
        cancel_url: `${appUrl}/app?billing=canceled`,
        metadata: { userId, type: 'credits' },
      });

      return NextResponse.json({ url: checkoutSession.url });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
