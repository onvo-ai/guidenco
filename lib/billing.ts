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

/**
 * How many tokens equal 1 credit.
 *
 * Gemini 3.1 Pro Preview: $2/M input, $12/M output (blended ~$4/M at 4:1 ratio).
 * Pro plan: $20/month = 500 credits → $0.04 per credit.
 * At 2,000 tokens per credit → blended LLM cost ≈ $0.008 → ~80% gross margin.
 */
export const TOKENS_PER_CREDIT = 2000;

export async function ensureUserCredits(userId: string, balance: number = PLANS.free.credits): Promise<number> {
  const [row] = await db.select().from(credits).where(eq(credits.userId, userId)).limit(1);

  if (row) {
    return row.balance;
  }

  await db.insert(credits).values({
    userId,
    balance,
    lastResetAt: new Date(),
  });

  return balance;
}

/** Returns the user's current credit balance (0 if no record). */
export async function getUserCredits(userId: string): Promise<number> {
  const [row] = await db.select().from(credits).where(eq(credits.userId, userId)).limit(1);
  return row?.balance ?? 0;
}

/**
 * Atomically deducts credits based on actual token usage (floor 0).
 * Charges 1 credit per TOKENS_PER_CREDIT tokens, minimum 1 credit per step.
 */
export async function deductCreditsForUsage(
  userId: string,
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
  }
): Promise<void> {
  const totalTokens = (usage.inputTokens ?? usage.promptTokens ?? 0) + (usage.outputTokens ?? usage.completionTokens ?? 0);
  const creditsToDeduct = Math.max(1, Math.ceil(totalTokens / TOKENS_PER_CREDIT));
  await db
    .update(credits)
    .set({ balance: sql`GREATEST(${credits.balance} - ${creditsToDeduct}, 0)`, updatedAt: new Date() })
    .where(eq(credits.userId, userId));
}
