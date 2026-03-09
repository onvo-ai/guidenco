import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
});

export const PLANS = {
  free: {
    name: 'Free',
    credits: 50,
    priceId: null,
  },
  pro: {
    name: 'Pro',
    credits: 500,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
  },
} as const;

export type Plan = keyof typeof PLANS;

// Credits awarded per add-on credit pack purchase
export const CREDIT_PACK_SIZE = 100;
