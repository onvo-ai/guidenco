-- Migration: Add model, token_count, and credit_count fields to all entity versions
-- This enables tracking of which model was used and how many tokens/credits were consumed

-- Add fields to document_versions
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "token_count" integer;
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "credit_count" integer;

-- Add fields to video_versions (model already exists, just add token/credit)
ALTER TABLE "video_versions" ADD COLUMN IF NOT EXISTS "token_count" integer;
ALTER TABLE "video_versions" ADD COLUMN IF NOT EXISTS "credit_count" integer;

-- Add fields to blog_article_versions
ALTER TABLE "blog_article_versions" ADD COLUMN IF NOT EXISTS "model" text;
ALTER TABLE "blog_article_versions" ADD COLUMN IF NOT EXISTS "token_count" integer;
ALTER TABLE "blog_article_versions" ADD COLUMN IF NOT EXISTS "credit_count" integer;

-- Add fields to social_post_versions
ALTER TABLE "social_post_versions" ADD COLUMN IF NOT EXISTS "model" text;
ALTER TABLE "social_post_versions" ADD COLUMN IF NOT EXISTS "token_count" integer;
ALTER TABLE "social_post_versions" ADD COLUMN IF NOT EXISTS "credit_count" integer;
