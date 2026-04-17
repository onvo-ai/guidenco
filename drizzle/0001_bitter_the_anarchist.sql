ALTER TABLE "asset_chat_messages" DROP CONSTRAINT "asset_chat_messages_asset_id_assets_id_fk";
--> statement-breakpoint
ALTER TABLE "asset_chat_messages" ADD COLUMN "asset_version_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD COLUMN "status" text DEFAULT 'done' NOT NULL;--> statement-breakpoint
ALTER TABLE "blog_article_versions" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "blog_article_versions" ADD COLUMN "token_count" integer;--> statement-breakpoint
ALTER TABLE "blog_article_versions" ADD COLUMN "credit_count" integer;--> statement-breakpoint
ALTER TABLE "blog_article_versions" ADD COLUMN "status" text DEFAULT 'done' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "token_count" integer;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "credit_count" integer;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "name" text DEFAULT 'Untitled Experiment' NOT NULL;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "start_date" timestamp;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "end_date" timestamp;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "check_in_interval" integer;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "goal_metric" text;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "current_iteration" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "scores" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "social_post_versions" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "social_post_versions" ADD COLUMN "token_count" integer;--> statement-breakpoint
ALTER TABLE "social_post_versions" ADD COLUMN "credit_count" integer;--> statement-breakpoint
ALTER TABLE "video_versions" ADD COLUMN "token_count" integer;--> statement-breakpoint
ALTER TABLE "video_versions" ADD COLUMN "credit_count" integer;--> statement-breakpoint
ALTER TABLE "asset_chat_messages" ADD CONSTRAINT "asset_chat_messages_asset_version_id_asset_versions_id_fk" FOREIGN KEY ("asset_version_id") REFERENCES "public"."asset_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_chat_messages" DROP COLUMN "asset_id";--> statement-breakpoint
ALTER TABLE "asset_chat_messages" DROP COLUMN "model";