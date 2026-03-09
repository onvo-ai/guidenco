import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  uuid,
  boolean,
} from "drizzle-orm/pg-core";

// BetterAuth Tables
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phoneNumber: text("phone_number"),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const verifications = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Documents table
export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull().default("Untitled Document"),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  currentVersion: integer("current_version").default(0).notNull(),
  thumbnail: text("thumbnail"), // Base64 encoded thumbnail image
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Document versions table
export const documentVersions = pgTable("document_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  html: text("html").notNull(),
  googleFonts: text("google_fonts").array(), // Array of Google Font family names
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Teams table
export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Team members (accepted invites)
export const teamMembers = pgTable("team_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  joinedAt: timestamp("joined_at", { mode: "date" }).defaultNow().notNull(),
});

// Pending invites (matched by email on signup)
export const teamInvites = pgTable("team_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name"),
  invitedBy: text("invited_by")
    .notNull()
    .references(() => users.id),
  status: text("status").notNull().default("pending"), // 'pending' | 'accepted'
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Agent settings (per-team)
export const agentSettings = pgTable("agent_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  designGuidelines: text("design_guidelines").default(""),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Design warehouse assets (per-team)
export const brandAssets = pgTable("brand_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  description: text("description").default(""),
  fileKey: text("file_key").notNull(), // S3/MinIO object key
  fileUrl: text("file_url").notNull(), // Public or signed URL
  mimeType: text("mime_type").notNull(),
  source: text("source").notNull().default("uploaded"), // 'uploaded' | 'chat' | 'generated'
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Generated SVG assets
export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled Asset"),
  width: integer("width").notNull().default(1024),
  height: integer("height").notNull().default(1024),
  svgContent: text("svg_content").notNull().default(""),
  currentVersion: integer("current_version").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const assetVersions = pgTable("asset_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  svgContent: text("svg_content").notNull(),
  title: text("title").notNull().default("Untitled Asset"),
  width: integer("width").notNull().default(1024),
  height: integer("height").notNull().default(1024),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Generated videos
export const videos = pgTable("videos", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled Video"),
  remotionCode: text("remotion_code").notNull().default(""),
  width: integer("width").notNull().default(1920),
  height: integer("height").notNull().default(1080),
  durationInFrames: integer("duration_in_frames").notNull().default(150),
  fps: integer("fps").notNull().default(30),
  videoUrl: text("video_url"),
  status: text("status").notNull().default("pending"), // 'pending' | 'rendering' | 'done' | 'error'
  currentVersion: integer("current_version").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const videoVersions = pgTable("video_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  videoId: uuid("video_id")
    .notNull()
    .references(() => videos.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  title: text("title").notNull().default("Untitled Video"),
  remotionCode: text("remotion_code").notNull(),
  width: integer("width").notNull().default(1920),
  height: integer("height").notNull().default(1080),
  durationInFrames: integer("duration_in_frames").notNull().default(150),
  fps: integer("fps").notNull().default(30),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Chat messages for asset generation
export const assetChatMessages = pgTable("asset_chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: jsonb("content").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Chat messages for video generation
export const videoChatMessages = pgTable("video_chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  videoId: uuid("video_id")
    .notNull()
    .references(() => videos.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: jsonb("content").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Subscriptions table
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripePriceId: text("stripe_price_id"),
  plan: text("plan").notNull().default("free"), // 'free' | 'pro'
  status: text("status").notNull().default("active"), // 'active' | 'canceled' | 'past_due' | 'trialing'
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Credits table
export const credits = pgTable("credits", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  balance: integer("balance").notNull().default(0),
  lastResetAt: timestamp("last_reset_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Chat messages table
export const documentChatMessages = pgTable("document_chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: jsonb("content").notNull(), // Store parts array as JSON
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});
