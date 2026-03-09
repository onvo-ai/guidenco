import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { subscriptions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { stripe } from '@/lib/billing';

export async function POST() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, session.user.id))
      .limit(1);

    if (!sub?.stripeCustomerId) {
      return NextResponse.json({ error: 'No billing account found' }, { status: 404 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${appUrl}/app`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error('Error creating portal session:', error);
    return NextResponse.json({ error: 'Failed to create portal session' }, { status: 500 });
  }
}
