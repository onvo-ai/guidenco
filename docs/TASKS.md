# Guidenco — Remaining Tasks

## 1. Experiments System

- [ ] If an artwork is linked to an experiment, show the experiment details as a floating rounded corner card in the top left of an artwork's details page
- [ ] Timeline/scheduling UI — start date, check-in interval, end date as a small calendar widget
- [ ] Metric/goal UI — define the metric being tracked (e.g. CTR, engagement rate, conversion) as a line chart
- [ ] MCP tool `create_experiment` — lets Claude set up an experiment (entity type, parameters, timeline, goal metric, max iterations)
- [ ] MCP tool `get_experiment_results` — fetch metric scores and parameter history for an experiment
- [ ] MCP tool `run_experiment_iteration` — generate the next iteration for an experiment, given current scores
- [ ] Implement cross-pollination logic: at the end of a timeline, score each parameter variant and generate a new experiment using the best-performing parameter combination
- [ ] Implement Karpathy-style auto-improve loop: the system prompts Claude to evaluate the last generation, identify what to tweak, update parameters, and regenerate
- [ ] Link experiment iterations to entity versions (each version stores which `experimentId` and parameter snapshot it was generated with)

---

## 2. MCP Tools — Generation Agent Tooling

### Image Search

- [ ] MCP tool `search_images` — searches Unsplash and Pexels, returns URL + base64 resized PNG preview per result
- [ ] Implement Unsplash API integration (key is in env) in a shared service
- [ ] Implement Pexels photo API integration in a shared service
- [ ] Expose image search to document, blog, and social post agents (via tool call during generation)

### Existing Artwork Search

- [ ] MCP tool `search_artwork` — searches the user's own assets and documents, returns URL + base64 resized PNG preview so Claude can pick the right one to embed

### Agent Render / Inspect

- [ ] MCP tool `render_asset` — takes an asset ID, renders the stored SVG to PNG (via Sharp), and returns a base64 PNG so the agent can inspect and iterate
- [ ] MCP tool `render_document` — takes a document ID, renders the stored HTML to PNG (via Puppeteer), and returns a base64 PNG so the agent can inspect and iterate
- [ ] Wire the render tools into the asset-chat and document-chat generation loops so the LLM automatically inspects after each generation step

### Video Tools

- [ ] MCP tool `search_videos` — searches Pexels for stock videos, returns URL + title per result
- [ ] Implement Pexels video API integration in a shared service
- [ ] MCP tool `search_audio` — searches Freesound for audio clips, returns download URL + preview
- [ ] Implement Freesound API integration in a shared service
- [ ] MCP tool `text_to_speech` — converts a text string to an audio file (ElevenLabs or OpenAI TTS), returns a signed S3 URL
- [ ] Implement TTS provider integration (ElevenLabs API or OpenAI TTS)

### Agent-to-Agent (Sub-agent Tools)

- [ ] MCP tool `create_artwork_for_embed` — triggers asset or document generation and returns the result URL; used by video, blog, and social agents to generate images inline
- [ ] Wire `create_artwork_for_embed` into video-chat, blog-chat, and social-chat generation prompts

---

## 3. Asset (SVG) Agent

- [x] Update asset generation agent system prompt to use `render_asset` tool for inspection after each draft
- [x] Add iterative refinement loop: generate → render → inspect → adjust, up to N rounds
- [x] Expose `width` and `height` configuration when creating an asset via MCP

---

## 4. Document (HTML) Agent

- [ ] Update document generation agent system prompt to call `search_images` for photo needs
- [ ] Update document generation agent system prompt to call `search_artwork` for embedding existing assets
- [ ] Update document generation agent system prompt to use `render_document` for inspection after each draft
- [ ] Add iterative refinement loop: generate → render → inspect → adjust, up to N rounds
- [ ] Support multi-page documents: each page is a separate HTML section; agent can add/remove pages

---

## 5. Video Agent

- [ ] Wire `search_images`, `search_videos`, `search_audio`, `text_to_speech` into the video-chat generation agent
- [ ] Wire `create_artwork_for_embed` so the video agent can commission new SVG/document assets mid-generation
- [ ] Wire `search_artwork` so the video agent can embed previously created artwork
- [ ] Add a "preview frame" step: after generating Remotion code, render a single frame PNG via `/api/videos/preview` and return it for inspection
- [ ] Update video-chat system prompt to use these tools correctly

---

## 6. Blog Article Agent

- [ ] Wire `search_images` into the blog-chat agent for banner and inline images
- [ ] Wire `create_artwork_for_embed` into blog-chat so the agent can commission custom illustrations
- [ ] Wire `search_artwork` for reusing existing brand assets in articles
- [ ] Update blog-chat system prompt to use these tools

---

## 7. Social Post Agent

- [ ] Wire `search_images` into the social-chat agent for post imagery
- [ ] Wire `create_artwork_for_embed` into social-chat for commissioning custom visuals
- [ ] Wire `search_artwork` for reusing existing brand assets
- [ ] Update social-chat system prompt to use these tools

---

## 8. Projects

- [ ] Implement project home page (`/app/projects/[id]`) with a dashboard showing all entities (assets, documents, videos, articles, posts) scoped to that project
- [ ] Add `projectId` FK to the 5 entity tables (or a junction table) so entities can be scoped to a project
- [ ] API endpoint `POST /api/projects` — create a project
- [ ] API endpoint `GET /api/projects` — list projects for the org
- [ ] API endpoint `GET /api/projects/[id]/entities` — list all entities in a project
- [ ] MCP tool `list_projects` — lets Claude see what projects exist
- [ ] MCP tool `create_project` — lets Claude create a project and link new entities to it
- [ ] Sidebar project switcher — user can switch active project context
- [ ] Entity creation flow updated to optionally assign to a project

---

## 9. MCP Server — OAuth & Token Management

- [ ] Test and validate full OAuth OIDC flow end-to-end (authorization code → token exchange → refresh)
- [ ] Add token revocation endpoint (`DELETE /api/mcp-tokens/[id]`) and surface it in settings UI
- [ ] Show MCP token last-used timestamp in settings UI
- [ ] Add scope description labels to the OAuth consent screen

---

## 10. Billing & Credits

- [ ] Add a per-organization usage history page listing credit deductions with entity references
- [ ] Show low-credit warning banner when credit balance falls below threshold (e.g. < 10 credits)
- [ ] Enforce credit checks on experiment iteration API calls
- [ ] Add credit cost estimation before long-running generations (optional, surfaced as a warning in chat)

---

## 11. Settings & Design Guidelines

- [ ] Add brand color palette picker to agent settings (feeds into AI generation prompts)
- [ ] Add typography/font preferences to agent settings
- [ ] Add tone/voice selector (formal, casual, playful) to agent settings
- [ ] Surface agent settings fields as structured form inputs rather than free-text (currently likely free-text)

---

## 12. UI / Dashboard

- [ ] Global search across all entity types (documents, assets, videos, articles, posts)
- [ ] Entity tagging and filtering by tag in the dashboard
- [ ] Batch delete entities from the dashboard list
- [ ] "Duplicate" entity action (creates a new entity pre-seeded with the current version's content)
- [ ] Empty-state onboarding prompts for new users with example prompts

---

## 13. Infrastructure & Quality

- [ ] API rate limiting on generation endpoints (prevent runaway AI spend)
- [ ] Background job queue for long-running renders (Remotion) — currently synchronous
- [ ] Render status polling endpoint so the client knows when a video render is complete without polling the full video object
- [ ] End-to-end tests for critical flows (create entity, run generation, download)
- [ ] Error boundary UI components for generation failures in the chat interface
