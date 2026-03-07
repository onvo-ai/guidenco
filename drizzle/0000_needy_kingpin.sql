CREATE TABLE "users" (
 	"id" text PRIMARY KEY NOT NULL,
 	"name" text NOT NULL,
 	"email" text NOT NULL,
 	"phone_number" text,
 	"email_verified" boolean DEFAULT false NOT NULL,
 	"image" text,
 	"created_at" timestamp DEFAULT now() NOT NULL,
 	"updated_at" timestamp DEFAULT now() NOT NULL,
 	CONSTRAINT "users_email_unique" UNIQUE("email")
 );
 --> statement-breakpoint
 CREATE TABLE "sessions" (
 	"id" text PRIMARY KEY NOT NULL,
 	"expires_at" timestamp NOT NULL,
 	"token" text NOT NULL,
 	"created_at" timestamp DEFAULT now() NOT NULL,
 	"updated_at" timestamp DEFAULT now() NOT NULL,
 	"ip_address" text,
 	"user_agent" text,
 	"user_id" text NOT NULL,
 	CONSTRAINT "sessions_token_unique" UNIQUE("token")
 );
 --> statement-breakpoint
 CREATE TABLE "accounts" (
 	"id" text PRIMARY KEY NOT NULL,
 	"account_id" text NOT NULL,
 	"provider_id" text NOT NULL,
 	"user_id" text NOT NULL,
 	"access_token" text,
 	"refresh_token" text,
 	"id_token" text,
 	"access_token_expires_at" timestamp,
 	"refresh_token_expires_at" timestamp,
 	"scope" text,
 	"password" text,
 	"created_at" timestamp DEFAULT now() NOT NULL,
 	"updated_at" timestamp DEFAULT now() NOT NULL
 );
 --> statement-breakpoint
 CREATE TABLE "verification" (
 	"id" text PRIMARY KEY NOT NULL,
 	"identifier" text NOT NULL,
 	"value" text NOT NULL,
 	"expires_at" timestamp NOT NULL,
 	"created_at" timestamp DEFAULT now(),
 	"updated_at" timestamp DEFAULT now()
 );
 --> statement-breakpoint
 CREATE TABLE "projects" (
 	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 	"user_id" text NOT NULL,
 	"name" text NOT NULL,
 	"type" text DEFAULT 'document' NOT NULL,
 	"created_at" timestamp DEFAULT now() NOT NULL,
 	"updated_at" timestamp DEFAULT now() NOT NULL
 );
 --> statement-breakpoint
 CREATE TABLE "documents" (
 	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 	"project_id" uuid NOT NULL,
 	"title" text DEFAULT 'Untitled Document' NOT NULL,
 	"width" integer NOT NULL,
 	"height" integer NOT NULL,
 	"current_version" integer DEFAULT 0 NOT NULL,
 	"thumbnail" text,
 	"created_at" timestamp DEFAULT now() NOT NULL,
 	"updated_at" timestamp DEFAULT now() NOT NULL
 );
 --> statement-breakpoint
 CREATE TABLE "document_versions" (
 	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 	"document_id" uuid NOT NULL,
 	"version" integer NOT NULL,
 	"html" text NOT NULL,
 	"google_fonts" text[],
 	"created_at" timestamp DEFAULT now() NOT NULL
 );
 --> statement-breakpoint
 CREATE TABLE "teams" (
 	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 	"name" text NOT NULL,
 	"owner_id" text NOT NULL,
 	"created_at" timestamp DEFAULT now() NOT NULL
 );
 --> statement-breakpoint
 CREATE TABLE "team_members" (
 	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 	"team_id" uuid NOT NULL,
 	"user_id" text NOT NULL,
 	"role" text DEFAULT 'member' NOT NULL,
 	"joined_at" timestamp DEFAULT now() NOT NULL
 );
 --> statement-breakpoint
 CREATE TABLE "team_invites" (
 	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 	"team_id" uuid NOT NULL,
 	"email" text NOT NULL,
 	"name" text,
 	"invited_by" text NOT NULL,
 	"status" text DEFAULT 'pending' NOT NULL,
 	"created_at" timestamp DEFAULT now() NOT NULL
 );
 --> statement-breakpoint
 CREATE TABLE "agent_settings" (
 	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 	"team_id" uuid NOT NULL,
 	"design_guidelines" text DEFAULT '',
 	"created_at" timestamp DEFAULT now() NOT NULL,
 	"updated_at" timestamp DEFAULT now() NOT NULL
 );
 --> statement-breakpoint
 CREATE TABLE "assets" (
 	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 	"team_id" uuid NOT NULL,
 	"uploaded_by" text NOT NULL,
 	"title" text NOT NULL,
 	"description" text DEFAULT '',
 	"file_key" text NOT NULL,
 	"file_url" text NOT NULL,
 	"mime_type" text NOT NULL,
 	"source" text DEFAULT 'uploaded' NOT NULL,
 	"created_at" timestamp DEFAULT now() NOT NULL
 );
 --> statement-breakpoint
 CREATE TABLE "project_assets" (
 	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 	"project_id" uuid NOT NULL,
 	"title" text DEFAULT 'Untitled Asset' NOT NULL,
 	"width" integer DEFAULT 1024 NOT NULL,
 	"height" integer DEFAULT 1024 NOT NULL,
 	"svg_content" text DEFAULT '' NOT NULL,
 	"current_version" integer DEFAULT 0 NOT NULL,
 	"created_at" timestamp DEFAULT now() NOT NULL,
 	"updated_at" timestamp DEFAULT now() NOT NULL
 );
 --> statement-breakpoint
 CREATE TABLE "asset_versions" (
 	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 	"asset_id" uuid NOT NULL,
 	"version" integer NOT NULL,
 	"svg_content" text NOT NULL,
 	"title" text DEFAULT 'Untitled Asset' NOT NULL,
 	"width" integer DEFAULT 1024 NOT NULL,
 	"height" integer DEFAULT 1024 NOT NULL,
 	"created_at" timestamp DEFAULT now() NOT NULL
 );
 --> statement-breakpoint
 CREATE TABLE "project_videos" (
 	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 	"project_id" uuid NOT NULL,
 	"title" text DEFAULT 'Untitled Video' NOT NULL,
 	"remotion_code" text DEFAULT '' NOT NULL,
 	"width" integer DEFAULT 1920 NOT NULL,
 	"height" integer DEFAULT 1080 NOT NULL,
 	"duration_in_frames" integer DEFAULT 150 NOT NULL,
 	"fps" integer DEFAULT 30 NOT NULL,
 	"video_url" text,
 	"status" text DEFAULT 'pending' NOT NULL,
 	"current_version" integer DEFAULT 0 NOT NULL,
 	"created_at" timestamp DEFAULT now() NOT NULL,
 	"updated_at" timestamp DEFAULT now() NOT NULL
 );
 --> statement-breakpoint
 CREATE TABLE "video_versions" (
 	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 	"video_id" uuid NOT NULL,
 	"version" integer NOT NULL,
 	"title" text DEFAULT 'Untitled Video' NOT NULL,
 	"remotion_code" text NOT NULL,
 	"width" integer DEFAULT 1920 NOT NULL,
 	"height" integer DEFAULT 1080 NOT NULL,
 	"duration_in_frames" integer DEFAULT 150 NOT NULL,
 	"fps" integer DEFAULT 30 NOT NULL,
 	"created_at" timestamp DEFAULT now() NOT NULL
 );
 --> statement-breakpoint
 CREATE TABLE "document_chat_messages" (
 	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 	"project_id" uuid NOT NULL,
 	"role" text NOT NULL,
 	"content" jsonb NOT NULL,
 	"created_at" timestamp DEFAULT now() NOT NULL
 );
 --> statement-breakpoint
 CREATE TABLE "asset_chat_messages" (
 	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 	"project_id" uuid NOT NULL,
 	"role" text NOT NULL,
 	"content" jsonb NOT NULL,
 	"created_at" timestamp DEFAULT now() NOT NULL
 );
 --> statement-breakpoint
 CREATE TABLE "video_chat_messages" (
 	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 	"project_id" uuid NOT NULL,
 	"role" text NOT NULL,
 	"content" jsonb NOT NULL,
 	"created_at" timestamp DEFAULT now() NOT NULL
 );
 --> statement-breakpoint
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
 ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
 ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
 ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
 ALTER TABLE "teams" ADD CONSTRAINT "teams_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
 ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
 ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
 ALTER TABLE "agent_settings" ADD CONSTRAINT "agent_settings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
 ALTER TABLE "assets" ADD CONSTRAINT "assets_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
 ALTER TABLE "assets" ADD CONSTRAINT "assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
 ALTER TABLE "project_assets" ADD CONSTRAINT "project_assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
 ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_asset_id_project_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."project_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
 ALTER TABLE "project_videos" ADD CONSTRAINT "project_videos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
 ALTER TABLE "video_versions" ADD CONSTRAINT "video_versions_video_id_project_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."project_videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
 ALTER TABLE "document_chat_messages" ADD CONSTRAINT "document_chat_messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
 ALTER TABLE "asset_chat_messages" ADD CONSTRAINT "asset_chat_messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
 ALTER TABLE "video_chat_messages" ADD CONSTRAINT "video_chat_messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;