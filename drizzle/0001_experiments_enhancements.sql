-- Add new columns to experiments table
ALTER TABLE "experiments" ADD COLUMN "name" text DEFAULT 'Untitled Experiment' NOT NULL;
--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "start_date" timestamp;
--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "end_date" timestamp;
--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "check_in_interval" integer;
--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "goal_metric" text;
--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "current_iteration" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "scores" jsonb DEFAULT '[]';
