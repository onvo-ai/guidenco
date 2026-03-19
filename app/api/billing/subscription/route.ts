import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { subscriptions, credits } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { PLANS, ensureUserCredits } from '@/lib/billing';

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = session.user.id;

    // Get or default subscription record
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    // Get or default credits record
    const [creditRecord] = await db
      .select()
      .from(credits)
      .where(eq(credits.userId, userId))
      .limit(1);

    const plan = (sub?.plan ?? 'free') as keyof typeof PLANS;
    const planInfo = PLANS[plan] ?? PLANS.free;
    const balance = creditRecord?.balance ?? await ensureUserCredits(userId, planInfo.credits);

    return NextResponse.json({
      plan,
      planName: planInfo.name,
      status: sub?.status ?? 'active',
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
      credits: {
        balance,
        monthlyAllocation: planInfo.credits,
      },
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return NextResponse.json({ error: 'Failed to fetch subscription' }, { status: 500 });
  }
}
