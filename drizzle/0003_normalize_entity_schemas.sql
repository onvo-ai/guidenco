-- Migration: Normalize entity schemas for unified pending-version pattern
-- 1. Add status column to asset_versions (default 'done' for existing rows)
ALTER TABLE asset_versions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'done';

-- 2. Add status column to blog_article_versions (default 'done' for existing rows)
ALTER TABLE blog_article_versions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'done';

-- 3. Normalize asset_chat_messages to reference asset_version_id instead of asset_id
-- Step a: Add new column (nullable for migration)
ALTER TABLE asset_chat_messages ADD COLUMN IF NOT EXISTS asset_version_id uuid REFERENCES asset_versions(id) ON DELETE CASCADE;

-- Step b: Populate asset_version_id from each asset's latest version
UPDATE asset_chat_messages acm
SET asset_version_id = (
  SELECT av.id
  FROM asset_versions av
  WHERE av.asset_id = acm.asset_id
  ORDER BY av.version DESC
  LIMIT 1
)
WHERE acm.asset_version_id IS NULL;

-- Step c: Delete any messages that couldn't be linked (asset has no versions)
DELETE FROM asset_chat_messages WHERE asset_version_id IS NULL;

-- Step d: Drop the old asset_id column and model column
ALTER TABLE asset_chat_messages DROP COLUMN IF EXISTS asset_id;
ALTER TABLE asset_chat_messages DROP COLUMN IF EXISTS model;
