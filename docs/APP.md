# Guidenco

This app is a server and a Claude skill for Guidenco. It exposes a set of tools that agents can use to build marketing assets. There is also a harness system for experiments.

Users interact with the app in two primary ways:

1. **Direct creation** — connect Guidenco to Claude Code via MCP, then instruct Claude to create an asset, document, video, blog article, or social post. Claude calls the appropriate MCP tool, which triggers an AI generation agent on the server. The agent produces content, iterates on it using inspection tools, and returns the result URL.

2. **Experiments** — instruct Claude to set up an experiment with a goal metric, a set of parameters to vary, a timeline, and a number of generations. Claude calls `create_experiment`, which triggers a series of generation runs on the server. After each run, Claude (or an automated loop) checks the metric score, calls `run_experiment_iteration` to generate the next version, and repeats. At the end of the timeline, the best-performing parameter combination is identified and a new experiment is seeded from it.

---

## Tech Stack

- **Framework:** Next.js 15 (App Router, Turbopack)
- **AI SDK:** Vercel AI SDK v6 with streaming
- **LLM provider:** OpenRouter (default model: `google/gemini-2.5-pro-preview-03-25`)
- **Database:** PostgreSQL via Drizzle ORM
- **Auth:** Better Auth with email/password, Google, Facebook, GitHub, and MCP OAuth OIDC
- **Storage:** AWS S3 or MinIO (S3-compatible)
- **Billing:** Stripe (credits system: 1 credit = 2,000 LLM tokens)
- **Email:** Resend
- **Video rendering:** Remotion + Puppeteer headless
- **Image processing:** Sharp, Canvas
- **UI:** Tailwind CSS v4, shadcn/ui, Radix UI

---

## Experiments

Marketing is built around systematic experimentation.

### Experiment structure

Each experiment has:
- **Entity** — a single document, asset, video, article, or social post that is being iterated on
- **Parameters** — key/value pairs that define what is being varied (e.g. `headline_tone: formal`, `cta_color: #FF0000`, `image_style: minimalist`). These are typed (string, number, boolean).
- **Goal metric** — the single metric being optimized (e.g. CTR, engagement rate, conversion rate). This is a human-supplied number recorded after each iteration.
- **Timeline** — start date, check-in interval (e.g. every 3 days), and end date.
- **Max depth / iterations** — caps how many auto-improve cycles can run.

### How the loop works

1. Claude (or an automated cron) creates the experiment via `create_experiment` MCP tool.
2. The server generates Version 1 of the entity using the initial parameter set.
3. After the check-in interval, the user (or an analytics integration) submits the metric score for that version via `POST /api/experiments/[id]/score`.
4. Claude calls `run_experiment_iteration`, which uses a Karpathy-style auto-research prompt: the LLM is given the parameter history, the metric scores, and the current generation, and it reasons about which single parameter to tweak and how. It then generates a new version with that tweak applied.
5. Steps 3–4 repeat until the timeline ends or max iterations is reached.
6. At the end of the timeline, the platform scores each parameter variant and identifies the winning combination. A new experiment is seeded via cross-pollination: the best value for each parameter is combined into a new parameter set and a new experiment is started.

### Multiple parallel experiments

Multiple experiments can run simultaneously on the same entity, each varying a different parameter. The cross-pollination step combines winners across all parallel experiments into the next generation.

### Implementation detail

- The `experiments` table stores the goal metric, timeline, and max depth.
- The `experiment_parameters` table stores each parameter as a typed key/value row linked to the experiment and to the specific entity version it applies to.
- Each entity version row carries an `experimentId` and a `parameterSnapshot` JSON column so the full parameter state at generation time is preserved.

---

## Agents

All AI agents use the Vercel AI SDK v6 with tool-calling and streaming. The default LLM is `google/gemini-2.5-pro-preview-03-25` via OpenRouter.

### Agent principles

- Each agent is invoked via a POST to its chat endpoint (e.g. `/api/asset-chat`, `/api/chat`, `/api/video-chat`).
- The agent receives: (a) the user's prompt, (b) the entity's existing content (if iterating), (c) the org's design guidelines, and (d) a set of tools specific to its type.
- **Inspection loop:** for visual content (SVGs, HTML documents, video frames), after each generation the agent calls a render tool, receives a base64 PNG, inspects it, and decides whether to revise or accept. This continues for up to N rounds (configurable).
- **Sub-agent calling:** agents can call `create_artwork_for_embed` to commission a new SVG or document from another agent and get back a URL to embed.
- **Previous work context:** agents can call `search_artwork` to find existing assets in the user's library and embed them.
- Design guidelines (colors, fonts, tone/voice) stored in `agent_settings` are injected into every agent's system prompt.

### Credit accounting

Each LLM token consumed deducts credits atomically from the org's balance (1 credit per 2,000 tokens, minimum 1 credit per generation step). Generation is blocked if the balance is zero.

---

## Asset Creation (SVG)

Agents create simple graphics like logos, icons, and patterns as SVG code.

### Generation flow

1. MCP tool `create_asset` → creates an `assets` row, calls `/api/asset-chat`.
2. The asset agent generates SVG code.
3. The agent calls `render_asset` → the server renders the SVG to PNG via Sharp → returns base64 PNG.
4. The agent inspects the PNG, makes adjustments to the SVG, and repeats up to N rounds.
5. Final SVG is saved as a new `asset_versions` row and a thumbnail PNG is stored in S3.

### Tools available to the asset agent

- `render_asset(assetId)` → renders stored SVG to PNG, returns base64 for inspection
- `get_design_guidelines()` → fetches org brand colors, fonts, and style notes

### MCP tools (external)

- `create_asset(prompt, title?)` → creates and generates an asset, returns `{ id, fileUrl, downloadUrl, appUrl }`
- `list_assets()` → lists all assets for the org
- `download_asset(assetId)` → returns SVG content + download URL
- `search_artwork(query)` → searches user's existing assets/documents with base64 preview thumbnails

---

## Document Creation (HTML/CSS)

Agents create composited layouts — banners, posters, flyers, email templates, social cards — as self-contained HTML with inline Tailwind CSS.

The final output delivered by MCP is always a URL to a PNG render of the document, never raw HTML. HTML is the generation format; PNG is the delivery format.

### Generation flow

1. MCP tool `create_document` → creates a `documents` row, calls `/api/chat`.
2. The document agent generates HTML with inline Tailwind CSS and Google Fonts.
3. The agent calls `render_document` → the server renders the HTML in Puppeteer → returns base64 PNG.
4. The agent inspects the PNG, revises the HTML, and repeats up to N rounds.
5. Final HTML is saved as a new `document_versions` row (with width, height, Google Fonts list). A PNG thumbnail is uploaded to S3.

### Tools available to the document agent

- `search_images(query)` → searches Unsplash and Pexels; returns URL + base64 resized PNG preview per result
- `search_artwork(query)` → searches user's own assets/documents with preview thumbnails
- `render_document(documentId)` → renders stored HTML to PNG via Puppeteer, returns base64 for inspection
- `get_design_guidelines()` → fetches org brand colors, fonts, and style notes

### MCP tools (external)

- `create_document(prompt, title?)` → creates and generates a document, returns `{ id, fileUrl, downloadUrl, appUrl }`
- `list_documents()` → lists all documents for the org
- `download_document(documentId)` → returns HTML content + PNG download URL

---

## Video Creation (Remotion)

Agents create animated video compositions using Remotion. The agent writes a TypeScript/TSX Remotion composition, which is then bundled and rendered headlessly by Puppeteer + Remotion's renderer.

### Generation flow

1. MCP tool `create_video` → creates a `videos` row, calls `/api/video-chat`.
2. The video agent generates a Remotion composition (TSX + any supporting components).
3. The agent calls a "preview frame" step: `/api/videos/preview` renders a single frame PNG → base64 returned for inspection.
4. The agent revises the composition and repeats the preview step as needed.
5. When satisfied, the composition is saved as a new `video_versions` row.
6. `POST /api/videos/render` bundles and renders the full video using Remotion's CLI renderer in a background job. The rendered `.mp4` is uploaded to S3 and the `videoUrl` is stored on the video row.

### Tools available to the video agent

- `search_images(query)` → Unsplash + Pexels photo search, URL + base64 preview
- `search_videos(query)` → Pexels video search, returns URL + metadata
- `search_audio(query)` → Freesound audio search, returns download URL + preview
- `text_to_speech(text, voice?)` → converts text to MP3 via ElevenLabs or OpenAI TTS, returns signed S3 URL
- `create_artwork_for_embed(description, type)` → commissions a new SVG asset or HTML document, returns its render URL for embedding in the composition
- `search_artwork(query)` → searches user's existing assets/documents with preview thumbnails
- `preview_video_frame(videoId)` → renders a single frame PNG of the current Remotion code, returns base64

### MCP tools (external)

- `create_video(prompt, title?)` → creates and generates a video, returns `{ id, status, videoUrl?, appUrl }`
- `list_videos()` → lists all videos for the org with render status
- `download_video(videoId)` → returns signed S3 URL to the rendered `.mp4`

---

## Blog Article Creation

Agents write long-form markdown blog posts with banner images, inline images, and optional custom illustrations.

### Generation flow

1. MCP tool `create_blog_article` → creates a `blog_articles` row, calls `/api/blog-chat`.
2. The blog agent writes the article in Markdown.
3. The agent calls `search_images` to find a suitable banner image and inline images.
4. The agent can call `create_artwork_for_embed` to commission a custom SVG illustration and embed the render URL inline.
5. Final Markdown is saved as a new `blog_article_versions` row with `bannerImage`, `tags`, and word count metadata.

### Tools available to the blog agent

- `search_images(query)` → Unsplash + Pexels photo search
- `search_artwork(query)` → user's existing assets/documents with previews
- `create_artwork_for_embed(description, type)` → commissions a new asset/document, returns URL

### MCP tools (external)

- `create_blog_article(prompt, title?)` → creates and generates an article, returns `{ id, wordCount, appUrl }`
- `list_blog_articles()` → lists all articles with word count and tags
- `download_blog_article(articleId)` → returns Markdown content

---

## Social Media Content Creation

Agents write platform-optimized social media posts (Twitter/X, LinkedIn, Instagram, Facebook) with hashtags and optional media attachments.

### Generation flow

1. MCP tool `create_social_post` → creates a `social_posts` row with the target platform, calls `/api/social-chat`.
2. The social agent writes copy optimized for the platform's format (character limits, tone conventions, hashtag norms).
3. The agent calls `search_images` to find suitable imagery.
4. The agent can call `create_artwork_for_embed` to commission a custom graphic (e.g. a quote card or product banner) and attach its render URL as `mediaUrl`.
5. Final content + hashtags are saved as a new `social_post_versions` row.

### Tools available to the social agent

- `search_images(query)` → Unsplash + Pexels photo search
- `search_artwork(query)` → user's existing assets/documents with previews
- `create_artwork_for_embed(description, type)` → commissions a new asset/document, returns URL

### MCP tools (external)

- `create_social_post(prompt, title?, platform?)` → creates and generates a post, returns `{ id, platform, hashtags, appUrl }`
- `list_social_posts()` → lists all posts with platform and hashtag info
- `download_social_post(postId)` → returns post text + hashtags + mediaUrl

---

## MCP Server

The MCP server (`/api/mcp`) uses the `@modelcontextprotocol/sdk` and is authenticated via either:

1. **Bearer token** — a hashed MCP token stored in the `mcp_tokens` table, generated from Settings → API → Generate Token.
2. **OAuth OIDC** — standard OAuth 2.0 authorization code flow. Claude Code connects via `/.well-known/oauth-authorization-server` discovery. Access tokens are valid for 60 minutes; refresh tokens are valid for 30 days. Scopes: `openid profile email offline_access mcp:tools`.

### Full tool list

| Tool | Category | Description |
|---|---|---|
| `list_assets` | Assets | List all SVG assets |
| `download_asset` | Assets | Fetch SVG + download URL |
| `create_asset` | Assets | Generate a new SVG from a prompt |
| `render_asset` | Assets | Render SVG to PNG for inspection |
| `list_documents` | Documents | List all HTML documents |
| `download_document` | Documents | Fetch HTML + download URL |
| `create_document` | Documents | Generate a new document from a prompt |
| `render_document` | Documents | Render HTML to PNG for inspection |
| `list_videos` | Videos | List all videos with render status |
| `download_video` | Videos | Fetch signed S3 URL to `.mp4` |
| `create_video` | Videos | Generate a new video from a prompt |
| `list_blog_articles` | Blog | List all articles |
| `download_blog_article` | Blog | Fetch Markdown content |
| `create_blog_article` | Blog | Generate a new article from a prompt |
| `list_social_posts` | Social | List all posts |
| `download_social_post` | Social | Fetch post text + hashtags |
| `create_social_post` | Social | Generate a new post from a prompt |
| `search_images` | Media | Search Unsplash + Pexels; returns URL + preview |
| `search_videos` | Media | Search Pexels videos; returns URL + metadata |
| `search_audio` | Media | Search Freesound; returns download URL + preview |
| `text_to_speech` | Media | Convert text to MP3; returns signed S3 URL |
| `search_artwork` | Library | Search user's own assets/documents with previews |
| `create_artwork_for_embed` | Orchestration | Commission a new asset/document, returns render URL |
| `create_experiment` | Experiments | Create an iterative generation experiment |
| `get_experiment_results` | Experiments | Fetch metric scores and parameter history |
| `run_experiment_iteration` | Experiments | Trigger next auto-improve generation step |
| `list_projects` | Projects | List all projects in the org |
| `create_project` | Projects | Create a new project |

---

## Data Model (Key Tables)

- **`assets` / `asset_versions`** — SVG content, dimensions, thumbnail URLs
- **`documents` / `document_versions`** — HTML content, dimensions, Google Fonts, thumbnail URLs
- **`videos` / `video_versions`** — Remotion TSX code, FPS, duration, rendered `.mp4` URL
- **`blog_articles` / `blog_article_versions`** — Markdown content, banner image, tags
- **`social_posts` / `social_post_versions`** — platform, post text, hashtags, mediaUrl
- **`experiments`** — goal metric, timeline, max depth/iterations, linked entity
- **`experiment_parameters`** — typed key/value parameters linked to an experiment and entity version
- **`organizations` / `organization_members`** — team management with role-based access
- **`credits`** — per-org credit balance (1 credit = 2,000 LLM tokens)
- **`mcp_tokens`** — hashed API tokens for MCP access
- **`oauth_applications` / `oauth_access_tokens` / `oauth_consents`** — OAuth OIDC plumbing
- **`agent_settings`** — per-org design guidelines (colors, fonts, tone) injected into agent system prompts

---

## Deployment

- Docker Compose for local development: PostgreSQL + MinIO (S3-compatible)
- Production: standalone Next.js output, PostgreSQL, AWS S3, Stripe webhooks, Resend
- Environment variables: `POSTGRES_URL`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `BETTER_AUTH_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `AWS_*` / `S3_*`, `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY`, `FREESOUND_API_KEY`, `ELEVENLABS_API_KEY`, `RESEND_API_KEY`, social OAuth credentials
