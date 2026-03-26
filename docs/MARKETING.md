# Guidenco Marketing Plan

## Executive Summary

Guidenco is an AI-powered design tool that turns natural language descriptions into production-ready digital assets — banners, posters, social media graphics, and more — exported as PNG or clean HTML/Tailwind CSS code. The core value proposition is speed and zero design skill required: describe what you want, get a polished result instantly.

This plan centers on **Claude Code as the primary marketing engine**. Claude Code is used not just as a productivity tool but as a systematic content and outreach factory — writing copy, automating SEO pipelines, generating demo assets, running competitor research, and shipping distribution content at scale without hiring a marketing team.

---

## Target Audience

### Primary Audience — Indie Hackers & Solo Founders

These are developers or technical founders building products alone or in tiny teams. They need marketing assets (landing page banners, OG images, social graphics) but have no designer and no budget for one. Guidenco solves a real, recurring pain point for them.

**Where they live:** Hacker News (Show HN), Indie Hackers community, X/Twitter, Reddit r/indiehackers, Product Hunt.

**What motivates them:** Ship fast, look professional, keep costs low, own their stack.

**Pain point Guidenco solves directly:** "I need a banner for my Product Hunt launch tomorrow and I can't afford a designer."

### Secondary Audience — Content Creators & Social Media Managers

Non-technical users who publish regularly on Instagram, LinkedIn, YouTube, and TikTok and need on-brand graphics quickly. They currently rely on Canva but find it slow and template-bound.

**Where they live:** LinkedIn creator communities, Instagram, TikTok, YouTube creator forums, Creator Economy newsletters.

**What motivates them:** Speed, uniqueness (not looking like everyone else using the same Canva template), AI-first workflows.

### Tertiary Audience — Freelance Web Developers & Agencies

Developers who build client websites and need quick asset turnaround. The HTML export feature is a killer differentiator here — they can drop exported code straight into a project.

**Where they live:** GitHub, dev.to, Hashnode, Webflow community, freelance Discord servers.

**What motivates them:** Billable efficiency, impressing clients, reducing back-and-forth with designers.

---

## Competitive Positioning

| Tool | Weakness | Guidenco Advantage |
|---|---|---|
| Canva | Template-bound, no code export | Chat-driven, exports clean HTML/Tailwind |
| Figma | Steep learning curve, no AI generation | Zero learning curve, describe → done |
| Adobe Express | Expensive, Adobe ecosystem lock-in | Free tier, lightweight, code-first |
| Midjourney | No structured design, no export as HTML | Structured, editable, web-ready |

**Core positioning statement:** "Describe it. Design it. Deploy it." — Guidenco is the only AI design tool that exports production-ready HTML code, making it the designer for developers.

---

## Claude Code as the Primary Marketing Engine

This section is the centrepiece of the plan. Claude Code is used as an always-on marketing co-pilot that executes tasks across every channel. The goal is to systematize and automate the output of a full marketing function using a single tool.

### 1. Content Factory — SEO Blog Posts

**The play:** Use Claude Code to run a content pipeline that produces one SEO-optimised blog post per week targeting high-intent keywords. Each post is written, reviewed, and formatted entirely inside Claude Code.

**How to execute with Claude Code:**

First, use Claude Code to research your keyword targets. Open your terminal and run:

```bash
claude "Research the top 20 long-tail keywords for an AI design tool targeting indie hackers and developers. Focus on keywords with low competition and purchase intent. Output as a markdown table with keyword, estimated monthly search volume, and content angle."
```

Then generate the article:

```bash
claude "Write a 1,500-word SEO blog post targeting the keyword 'AI tool to create website banners'. The post should be written for indie hackers and solo founders. Include an intro, 4 sections with subheadings, practical tips, and a CTA to try Guidenco at the end. Tone: direct, no fluff, first-person friendly."
```

Then validate and improve:

```bash
claude "Review this blog post draft for SEO. Check: keyword density, internal linking opportunities, meta description, title tag, and readability score. Suggest improvements." < post-draft.md
```

**Target keywords to pursue (Claude Code can expand this list):**
- "AI banner generator free"
- "AI tool to make website graphics"
- "generate HTML banners with AI"
- "Canva alternative for developers"
- "create social media graphics with code"
- "AI design tool no Photoshop"

**Cadence:** One post per week, published to a `/blog` route on the Guidenco site. Use Claude Code to generate the MDX file directly, ready to push.

### 2. Automated Twitter/X Distribution

**The play:** Generate 30 days of tweets in one Claude Code session, scheduled across formats — product screenshots, hot takes, tutorials, user wins, and repurposed blog content.

**How to execute with Claude Code:**

```bash
claude "Generate a 30-day Twitter content calendar for Guidenco, an AI design tool for developers. Include: 8 product demo tweets, 6 educational threads (how-to), 6 hot takes on design for non-designers, 5 social proof / use case tweets, 5 reposts from related content. Each tweet should be under 280 characters. Format as a numbered list with the tweet text and a suggested posting day."
```

Then for threads specifically:

```bash
claude "Write a 7-tweet Twitter thread explaining how to build a complete landing page asset kit using Guidenco. Start with a strong hook. Include a real example workflow. End with a CTA. Use plain conversational language."
```

**Formats to rotate:**
- Before/after: "Spent 0 minutes designing this banner. Here's the prompt I used."
- Tutorial threads: "How I create all my OG images in 3 minutes using AI"
- Hot takes: "Canva is for people who have time. Guidenco is for founders."
- Milestone posts: "100 users in 7 days. Here's what worked."

**Posting rhythm:** 2 posts per day. Use Claude Code to batch-produce a month's worth in one sitting, then schedule via Buffer or Typefully.

### 3. Reddit Distribution Strategy

**The play:** Reddit is one of the highest-converting channels for developer tools and indie products. The key is contributing value first, promoting subtly second.

**Target subreddits:**
- r/webdev (890k members)
- r/indiehackers (190k members)
- r/SideProject (100k members)
- r/artificial (600k members)
- r/learnprogramming (5M members)
- r/freelance (340k members)
- r/web_design (800k members)

**How to execute with Claude Code:**

```bash
claude "Write a Reddit post for r/webdev about how I built a tool that generates HTML banners from plain English. It should be a genuine 'Show HN'-style post: what the problem was, how I solved it, what the tech stack looks like. Mention Guidenco naturally at the end. Avoid sounding like an ad. Tone: casual developer, self-aware."
```

For replying to existing threads:

```bash
claude "I found this Reddit thread where someone is asking how to quickly create social media graphics without Photoshop. Write me a helpful reply that answers their question genuinely, and mentions Guidenco as one option in a natural way. Here is the thread: [paste thread]"
```

**Content angles that perform well on Reddit:**
- "I built X because I was tired of Y" posts
- Tutorial posts with screenshots of real outputs
- "Roast my landing page" posts (drive traffic back to Guidenco)
- Sharing outputs: post a banner you made and mention how you made it

### 4. Product Hunt Launch

**The play:** A well-prepared Product Hunt launch can drive thousands of signups in a single day. Claude Code is used to prepare every single asset and piece of copy for launch day.

**How to execute with Claude Code:**

```bash
claude "Write the complete Product Hunt launch kit for Guidenco. Include: (1) Product name and tagline under 60 characters, (2) Product description 260 characters, (3) Long-form description 800 words, (4) First comment from the maker, (5) 5 questions to seed in comments, (6) 10 outreach messages to send to friends and communities asking for support, (7) A tweet to post on launch day."
```

Generate maker comment:

```bash
claude "Write an authentic Product Hunt maker comment for Guidenco. It should tell the story of why I built it, what makes it different from Canva and Figma, what's coming next, and invite people to ask questions. Tone: founder-to-founder, genuine, not salesy."
```

Generate hunter outreach:

```bash
claude "Write 10 personalised DM templates I can send to developer friends, indie hacker peers, and newsletter writers asking them to upvote and share Guidenco on Product Hunt on launch day. Each message should feel personal, not like a blast. Include one version for Twitter DM, one for email, one for Discord/Slack."
```

**Launch day checklist Claude Code can help produce:**
- Product screenshots (generate them using Guidenco itself — dogfood the product)
- OG image for the listing
- GIF walkthrough description
- Comment responses for common objections

### 5. Developer Community Demos (GitHub & Open Source)

**The play:** Build open-source demo projects using Guidenco's HTML export that showcase the tool in action. This gets discovered via GitHub search and positions Guidenco in developer conversations.

**How to execute with Claude Code:**

```bash
claude "Generate a README.md for an open-source repository of Guidenco-generated UI components. The repo should be called 'guidenco-components'. Include: project description, how-to-use, screenshot placeholder, contribution guide, and license. Make it look like a real popular open source project."
```

```bash
claude "Create a list of 10 open-source demo projects I could build using Guidenco's HTML export feature that would get traction on GitHub. Each should solve a real dev need and naturally showcase Guidenco's output. Examples: a landing page starter kit, an OG image template library, a social card generator."
```

**Concrete demo ideas:**
- A free library of AI-generated OG image templates
- A starter kit for Product Hunt launch assets
- A social media graphic template repo (all made with Guidenco)

These repos should link back to Guidenco in the README and include a "Made with Guidenco" badge.

### 6. Cold Outreach — Newsletter Writers and YouTubers

**The play:** Identify 50 newsletters and YouTube channels in the developer, indie hacker, and creator spaces. Use Claude Code to write personalised pitch emails to each.

**How to execute with Claude Code:**

```bash
claude "Write a cold email template for reaching out to developer-focused newsletter writers asking them to cover Guidenco. The email should: reference their specific newsletter by name (leave a placeholder), lead with the value to their readers not to us, include a one-line product description, offer a free extended trial or exclusive discount for their audience, and end with a simple clear ask. Keep it under 150 words."
```

```bash
claude "Generate a list of 20 newsletters I should pitch Guidenco to. Focus on newsletters for: indie hackers, developers, product designers, content creators, and solopreneurs. For each, include the newsletter name, estimated audience size, what kind of content they cover, and why Guidenco is relevant."
```

**Target publications:**
- Indie Hackers newsletter (300k+ subscribers)
- TLDR (tech) — 750k+ subscribers
- Creativerly (design tools for creators)
- The Pragmatic Engineer
- Bytes.dev (developer newsletter)
- Creator Science (Jay Clouse)
- Ben's Bites (AI tools newsletter)
- No Code Founders

For YouTube, use Claude Code to write video pitch scripts for tool-review channels:

```bash
claude "Write a YouTube video pitch email to a tech YouTuber who reviews AI and productivity tools. Suggest a video concept: 'I replaced my designer with this AI tool for 30 days'. Include talking points and a hook for their thumbnail."
```

### 7. SEO Technical Audit & Optimization

**The play:** Use Claude Code to audit the Guidenco landing page for technical SEO and copy improvements, then implement fixes directly.

**How to execute with Claude Code:**

```bash
claude "Audit the following landing page HTML for SEO. Check: (1) title tag and meta description quality, (2) heading hierarchy, (3) image alt text, (4) page speed suggestions, (5) structured data opportunities, (6) internal linking. Provide specific rewrites for each fix." < app/page.tsx
```

```bash
claude "Rewrite the hero section copy for Guidenco's landing page to improve conversion rate. Current copy: 'Create beautiful digital assets for your website'. Target audience: indie hackers and developers. Goal: make it more specific, outcome-focused, and urgent. Generate 5 variants to A/B test."
```

```bash
claude "Write the JSON-LD structured data markup for Guidenco as a SoftwareApplication. Include: name, description, applicationCategory, offers (free and paid), operatingSystem, and screenshot."
```

### 8. Viral Loop — "Made with Guidenco" Watermark Strategy

**The play:** Every exported design on the free tier carries a subtle "Made with Guidenco" watermark that links back to the site. Use Claude Code to plan and write the copy and implementation brief for this.

```bash
claude "Write the product copy and implementation brief for a 'Made with Guidenco' attribution watermark on free-tier exports. Include: watermark placement options, CTA text variants, what the link should go to (landing page vs. specific campaign page), and how to track conversions from this channel."
```

This creates a viral, zero-cost distribution loop: every asset shared publicly becomes an ad.

### 9. Competitor Gap Analysis

**The play:** Use Claude Code to systematically research competitors and find the gaps and angles Guidenco can own.

```bash
claude "Perform a detailed competitor analysis for Guidenco vs. Canva, Adobe Express, and Figma. For each competitor: (1) identify their weakest user segments, (2) find the top complaints in their reviews on G2 and Capterra, (3) list the features they're missing that Guidenco has, (4) suggest specific marketing messages that exploit each gap."
```

```bash
claude "Search for the top Reddit threads where people complain about Canva. Summarize the most common pain points and write 5 Guidenco ad copy variations that address each pain point directly."
```

### 10. Email Onboarding Sequence

**The play:** Every new free-tier user gets a 5-email onboarding sequence that drives activation, habit formation, and conversion to paid.

**How to execute with Claude Code:**

```bash
claude "Write a 5-email onboarding sequence for Guidenco new users. Email 1: welcome + first action (sent immediately). Email 2: tutorial tip (day 2). Email 3: use case inspiration (day 4). Email 4: social proof + feature highlight (day 7). Email 5: upgrade prompt (day 14). Each email should be under 200 words, plain text style, personal tone from the founder."
```

**Email subjects generated by Claude Code:**

```bash
claude "Generate 10 subject line variants for each of these 5 onboarding emails for Guidenco. Optimize for open rate. Avoid spam trigger words. Test curiosity vs. benefit-driven vs. urgency frames."
```

### 11. Programmatic SEO Pages

**The play:** Generate hundreds of landing pages targeting specific asset types and use cases. Each page targets a specific long-tail search query.

**Examples of pages to generate:**
- `/tools/ai-banner-generator`
- `/tools/ai-og-image-generator`
- `/tools/ai-social-media-graphic-generator`
- `/tools/ai-poster-maker`
- `/use-cases/banner-for-product-hunt`
- `/use-cases/youtube-thumbnail-generator`

**How to execute with Claude Code:**

```bash
claude "Generate the complete copy for a landing page targeting the keyword 'AI OG image generator'. Include: H1, subtitle, 3 feature bullets, 1 social proof quote, FAQ section (3 questions), and CTA. Target audience: developers and indie hackers. Tone: direct and technical."
```

```bash
claude "Create a sitemap of 50 programmatic SEO pages I should build for Guidenco. Each page should target a specific keyword with decent volume. Group them by: asset type pages, use case pages, comparison pages (vs. Canva etc.), and tutorial pages."
```

### 12. Claude Code Workflow Demos as Marketing Content

**The play:** Since this marketing plan is built around Claude Code, lean into this publicly. Create content showing how you use Claude Code to market Guidenco — it's genuinely interesting and meta, and it positions you as a sophisticated indie hacker.

```bash
claude "Write a blog post titled 'How I replaced my entire marketing team with Claude Code'. It should walk through exactly how I use Claude Code to write blog posts, generate tweets, do competitor research, write emails, and run a programmatic SEO pipeline for my SaaS Guidenco. Be specific, show real prompts."
```

This type of content performs extremely well on Hacker News, Indie Hackers, and X because it's both practical and contrarian.

---

## Distribution Channels Summary

| Channel | Primary Tactic | Claude Code Role | Expected Timeline |
|---|---|---|---|
| SEO Blog | Weekly posts, long-tail keywords | Write, optimize, format posts | 3–6 months for organic traction |
| Twitter/X | Daily posts, threads | Batch-generate 30-day calendars | Immediate, compounds over months |
| Reddit | Value-first posts and comments | Write posts and reply templates | Immediate traffic spikes |
| Product Hunt | Single launch event | Generate entire launch kit | One-time, plan 4 weeks out |
| GitHub | Open-source demo repos | Write READMEs, component docs | Slow burn, high-quality leads |
| Newsletter Outreach | Cold pitches to 50 newsletters | Write personalized pitch emails | 2–4 weeks response cycle |
| Email Onboarding | 5-email activation sequence | Write entire sequence | Set once, runs forever |
| Programmatic SEO | 50+ targeted landing pages | Generate page copy at scale | 3–6 months |
| Watermark Loop | Free tier attribution | Copy strategy and implementation | Immediate passive distribution |
| YouTube Demos | Tool review pitches | Write video pitches and scripts | 4–8 weeks |

---

## 90-Day Execution Roadmap

### Month 1 — Foundation

The focus in month 1 is getting the fundamentals right before scaling distribution.

Run Claude Code to audit the landing page SEO and implement fixes. Use Claude Code to generate the first 8 blog posts (schedule them weekly going forward). Set up the email onboarding sequence using Claude Code-written copy. Write 30 days of tweets using Claude Code and schedule them via Typefully. Open GitHub repo with first Guidenco component showcase. Submit to 3 directories: Product Hunt (coming soon page), Hacker News (Show HN), and Indie Hackers.

**Claude Code sessions needed this month:**
- 1 session: full SEO audit + landing page rewrites
- 1 session: 8 blog post drafts
- 1 session: 30-day tweet calendar
- 1 session: email onboarding sequence
- 1 session: GitHub README + component library

### Month 2 — Distribution

Focus on getting content in front of audiences.

Launch on Product Hunt (use the full Claude Code launch kit). Execute the newsletter outreach campaign (50 pitches written by Claude Code). Publish first 4 blog posts, promote each to Reddit and Twitter. Begin programmatic SEO: build the first 10 landing pages using Claude Code copy. Post Show HN on Hacker News.

**Claude Code sessions needed this month:**
- 1 session: Product Hunt launch kit
- 1 session: 50 cold outreach emails
- 1 session: 10 programmatic SEO pages
- Weekly: repurpose each blog post into 3 tweets + 1 Reddit post

### Month 3 — Iteration and Scale

Analyze what's working, double down, cut what isn't.

Review which blog posts are getting traction — use Claude Code to write more posts in the same vein. Identify the top-performing tweet formats and use Claude Code to generate more. Begin YouTube outreach campaign. Expand programmatic SEO to 40 additional pages. Write and publish the "How I replaced my marketing team with Claude Code" post and submit it everywhere.

**Claude Code sessions needed this month:**
- 1 session: performance review + content strategy pivot
- 1 session: 20 more programmatic SEO pages
- 1 session: YouTube pitch emails
- 1 session: the meta-marketing post

---

## Metrics to Track

**Acquisition:**
- Organic search traffic (target: 500 visits/month by month 3)
- Signups from blog posts (UTM tracking)
- Product Hunt upvotes and day-of signups
- Reddit post upvotes and click-through

**Activation:**
- % of new users who create their first asset within 24 hours (target: >40%)
- Email open rate on onboarding sequence (target: >35%)

**Retention:**
- Week-2 retention rate (% of users who return after first week)
- Number of assets exported per user

**Revenue:**
- Free to paid conversion rate (target: >3%)
- Monthly recurring revenue growth

---

## Budget Estimate

This plan is designed to be near-zero cost because Claude Code does the work of a content team.

| Item | Monthly Cost |
|---|---|
| Claude Code subscription | ~$20/month |
| Buffer or Typefully (scheduling) | $15–$18/month |
| Domain + hosting | Already covered |
| Email tool (Resend — already in stack) | $0–$20/month |
| **Total** | **~$55/month** |

Compare this to hiring even a part-time marketing contractor at $1,500–$3,000/month. Claude Code as a marketing engine is a 97% cost reduction.

---

## Quick Wins (Do These First)

These can be done in one afternoon using Claude Code:

1. Run the landing page SEO audit and implement the H1 rewrite, meta description, and JSON-LD structured data.
2. Generate the 30-day Twitter content calendar and schedule it.
3. Write and post a Show HN on Hacker News.
4. Write and post an Indie Hackers launch post.
5. Write the 5-email onboarding sequence and activate it in Resend.

Each of these takes one Claude Code prompt and delivers immediate, compounding value.

---

## Notes on Voice and Tone

All marketing copy for Guidenco should follow these principles:

**Direct.** No fluff, no padding. Say what it does in the first sentence.

**Developer-first.** Speak like a founder talking to another founder. Mention HTML, Tailwind, and code exports naturally — these are differentiators, not technical jargon to hide.

**Show, don't tell.** Every piece of content should include a real example output where possible. A banner. A social graphic. A screenshot. Let the product speak.

**Honest about the stage.** It's okay to say "we're a small team" or "built this because I needed it myself." This resonates with the indie hacker audience and builds trust.

Use Claude Code to audit any copy you write against these principles:

```bash
claude "Review this marketing copy for Guidenco against these principles: direct, developer-first, show don't tell, honest. Flag any violations and suggest rewrites." < copy.md
```
