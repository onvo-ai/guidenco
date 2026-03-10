import Stripe from 'stripe';
import { db } from '@/lib/db';
import { credits } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

// Only instantiate Stripe if the key is present — avoids a module-load crash
// when STRIPE_SECRET_KEY is not configured (billing routes will still fail at
// call-time, but unrelated routes like asset-chat won't be affected).
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-02-25.clover' })
  : (null as unknown as Stripe);

export const PLANS = {
  free: {
    name: 'Free',
    credits: 50,
    priceId: null,
  },
  pro: {
    name: 'Pro',
    credits: 500,
    productId: process.env.STRIPE_PRO_PRODUCT_ID,
  },
} as const;

export type Plan = keyof typeof PLANS;

// Credits awarded per add-on credit pack purchase
export const CREDIT_PACK_SIZE = 100;

/** Returns the user's current credit balance (0 if no record). */
export async function getUserCredits(userId: string): Promise<number> {
  const [row] = await db.select().from(credits).where(eq(credits.userId, userId)).limit(1);
  return row?.balance ?? 0;
}

/**
 * Atomically deducts 1 credit from the user's balance (floor 0).
 * Creates a record if one doesn't exist yet.
 */
export async function deductCredit(userId: string): Promise<void> {
  await db
    .update(credits)
    .set({ balance: sql`GREATEST(${credits.balance} - 1, 0)`, updatedAt: new Date() })
    .where(eq(credits.userId, userId));
}
