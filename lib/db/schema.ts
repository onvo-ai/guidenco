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
  activeOrganizationId: text("active_organization_id"),
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

export const organizations = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const organizationMembers = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const organizationInvitations = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull().default("pending"),
  teamId: text("team_id"),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
});

export const jwks = pgTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Documents table
export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: text("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull().default("Untitled Document"),
  currentVersion: integer("current_version").default(0).notNull(),
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
  width: integer("width").notNull().default(800),
  height: integer("height").notNull().default(600),
  thumbnail: text("thumbnail"), // Base64 encoded thumbnail image
  url: text("url"), // URL to the rendered document
  googleFonts: text("google_fonts").array(), // Array of Google Font family names
  prompt: text("prompt"),
  parentVersionId: uuid("parent_version_id"),
  model: text("model"),
  status: text("status").notNull().default("done"), // 'generating' | 'done' | 'error'
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Agent settings (per-organization)
export const agentSettings = pgTable("agent_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  designGuidelines: text("design_guidelines").default(""),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Design warehouse assets (per-organization)
export const brandAssets = pgTable("brand_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
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
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled Asset"),
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
  prompt: text("prompt"),
  parentVersionId: uuid("parent_version_id"),
  model: text("model"),
  tokenCount: integer("token_count"),
  creditCount: integer("credit_count"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Generated videos
export const videos = pgTable("videos", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled Video"),
  remotionCode: text("remotion_code").notNull().default(""),
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
  prompt: text("prompt"),
  parentVersionId: uuid("parent_version_id"),
  model: text("model"),
  videoUrl: text("video_url"),
  url: text("url"), // URL to the rendered video
  status: text("status").notNull().default("pending"),
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
  model: text("model"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Chat messages for video generation
export const videoChatMessages = pgTable("video_chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  videoVersionId: uuid("video_version_id")
    .notNull()
    .references(() => videoVersions.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: jsonb("content").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Subscriptions table
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" })
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
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" })
    .unique(),
  balance: integer("balance").notNull().default(0),
  lastResetAt: timestamp("last_reset_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// MCP access tokens
export const mcpTokens = pgTable("mcp_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  tokenHash: text("token_hash").notNull(),
  tokenPreview: text("token_preview").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
});

export const oauthApplications = pgTable("oauth_applications", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  metadata: text("metadata"),
  clientId: text("client_id").notNull().unique(),
  clientSecret: text("client_secret"),
  redirectURLs: text("redirect_urls").notNull(),
  type: text("type").notNull(),
  disabled: boolean("disabled").notNull().default(false),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const oauthAccessTokens = pgTable("oauth_access_tokens", {
  id: text("id").primaryKey(),
  accessToken: text("access_token").notNull().unique(),
  refreshToken: text("refresh_token").notNull().unique(),
  accessTokenExpiresAt: timestamp("access_token_expires_at").notNull(),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at").notNull(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthApplications.clientId, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  scopes: text("scopes").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const oauthConsents = pgTable("oauth_consents", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthApplications.clientId, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  scopes: text("scopes").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  consentGiven: boolean("consent_given").notNull().default(false),
});

// Blog articles
export const blogArticles = pgTable("blog_articles", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled Article"),
  currentVersion: integer("current_version").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const blogArticleVersions = pgTable("blog_article_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  articleId: uuid("article_id")
    .notNull()
    .references(() => blogArticles.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  title: text("title").notNull().default("Untitled Article"),
  content: text("content").notNull(),
  bannerImage: text("banner_image"),
  tags: text("tags").array(),
  url: text("url"), // URL to the rendered article
  prompt: text("prompt"),
  parentVersionId: uuid("parent_version_id"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const blogArticleChatMessages = pgTable("blog_article_chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  articleVersionId: uuid("article_version_id")
    .notNull()
    .references(() => blogArticleVersions.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: jsonb("content").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Social media posts
export const socialPosts = pgTable("social_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled Post"),
  currentVersion: integer("current_version").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const socialPostVersions = pgTable("social_post_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id")
    .notNull()
    .references(() => socialPosts.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  title: text("title").notNull().default("Untitled Post"),
  content: text("content").notNull(),
  hashtags: text("hashtags").array(),
  mediaUrl: text("media_url"),
  mediaType: text("media_type"),
  url: text("url"), // URL to the rendered social post
  prompt: text("prompt"),
  parentVersionId: uuid("parent_version_id"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const socialPostChatMessages = pgTable("social_post_chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  postVersionId: uuid("post_version_id")
    .notNull()
    .references(() => socialPostVersions.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: jsonb("content").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Chat messages table
export const documentChatMessages = pgTable("document_chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentVersionId: uuid("document_version_id")
    .notNull()
    .references(() => documentVersions.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: jsonb("content").notNull(), // Store parts array as JSON
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Experiments for iterative content generation
export const experiments = pgTable("experiments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  entityId: uuid("entity_id").notNull(), // The entity (document, asset, video, blog_article, social_post) this experiment is for
  entityType: text("entity_type").notNull(), // 'document' | 'asset' | 'video' | 'blog_article' | 'social_post'
  maxDepth: integer("max_depth").notNull().default(3), // How many times to iterate
  maxIterations: integer("max_iterations").notNull().default(5), // Maximum number of variations to generate per iteration
  timeLimit: timestamp("time_limit"), // Timestamp until the experiment ends
  status: text("status").notNull().default("active"), // 'active' | 'completed' | 'cancelled'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Experiment parameters - key-value pairs for experiment configuration
export const experimentParameters = pgTable("experiment_parameters", {
  id: uuid("id").primaryKey().defaultRandom(),
  experimentId: uuid("experiment_id")
    .notNull()
    .references(() => experiments.id, { onDelete: "cascade" }),
  key: text("key").notNull(), // Parameter name
  description: text("description"), // Parameter description
  type: text("type").notNull().default("string"), // 'string' | 'number' | 'boolean'
  stringValue: text("string_value"), // Value for string type
  numberValue: integer("number_value"), // Value for number type
  numberMin: integer("number_min"), // Optional min for number type
  numberMax: integer("number_max"), // Optional max for number type
  booleanValue: boolean("boolean_value"), // Value for boolean type
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
