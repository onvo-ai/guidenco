# Guidenco Landing Page Master Plan (DETAILED VERSION)

## Tech Stack

-   Framework: Next.js (App Router)
-   Styling: Tailwind CSS
-   Animations: Framer Motion
-   Architecture: Component-based, reusable, modular

------------------------------------------------------------------------

## Global Design System

### Colors (CSS Variables)

:root { --bg-primary: #0A0A0A; --bg-secondary: #111111; --accent:
#FF6A00; --accent-glow: rgba(255,106,0,0.4); --text-primary: #FFFFFF;
--text-secondary: #A1A1AA; --border: #1F1F1F; }

### Tailwind Config Mapping

Map variables into Tailwind theme for reuse.

------------------------------------------------------------------------

## Folder Structure

/components Hero.tsx Problem.tsx Solution.tsx HowItWorks.tsx
Channels.tsx Features.tsx AdvancedFeatures.tsx Results.tsx UseCases.tsx
Dashboard.tsx Testimonials.tsx CTA.tsx

------------------------------------------------------------------------

# SECTION DETAILS

------------------------------------------------------------------------

## 1. HERO SECTION

### Heading

Your AI Growth Engine That Finds What Actually Works

### Subheading

Guidenco understands your product, creates content across multiple
channels, tests performance, and continuously optimizes to drive real
growth.

### CTA

Primary: Start Growing\
Secondary: See How It Works

### Content Elements

-   Small badge: "AI-Powered Growth System"
-   Trust text: "Used by startups to find product-market fit faster"

### Asset / Animation

-   Central glowing orb (AI brain)
-   Lines connecting to platform icons
-   Floating content cards (posts, videos)

### Animation Details

-   Orb pulse using scale + opacity
-   Cards float slowly using translateY loop
-   Lines animate drawing using SVG stroke animation

------------------------------------------------------------------------

## 2. PROBLEM SECTION

### Heading

Most Startups Don't Fail Because of Product

### Subheading

They fail because they never figure out how to reach the right audience.

### Bullet Points

-   No clarity on which channels work
-   Inconsistent content strategy
-   No feedback loop
-   Money wasted on guesswork

### Asset

Messy dashboard UI

### Animation

-   Slight shake effect
-   Flickering red metrics
-   Random movement to show chaos

------------------------------------------------------------------------

## 3. SOLUTION SECTION

### Heading

Guidenco Removes the Guesswork

### Description

Guidenco analyzes your product, generates content, distributes it across
platforms, and learns from performance to continuously improve results.

### Asset

Clean system UI replacing chaos

### Animation

-   Smooth transition from messy UI to clean UI
-   Glow spreading across system

------------------------------------------------------------------------

## 4. HOW IT WORKS

### Steps Content

1.  Understand\
    Analyzes your product, audience, and positioning deeply

2.  Create\
    Generates high-quality posts, videos, and blogs

3.  Distribute\
    Publishes across LinkedIn, Instagram, YouTube, Reddit

4.  Optimize\
    Learns from engagement and improves continuously

### Animation

-   Step highlight on scroll
-   Progress line animating

------------------------------------------------------------------------

## 5. CHANNELS SECTION

### Heading

Every Channel. One Brain.

### Description

Guidenco experiments across all major platforms so you don't have to.

### Platforms

LinkedIn, Instagram, YouTube, Reddit, Blogs

### Animation

-   Orbit motion
-   Hover glow on icons

------------------------------------------------------------------------

## 6. FEATURES

### Heading

Everything You Need to Grow

### Features

AI Content Engine\
Creates posts, blogs, and scripts automatically

Multi-platform Publishing\
Distributes content across platforms

Performance Tracking\
Tracks engagement and conversions

Optimization Loop\
Improves content automatically

### Animation

-   Card hover effects
-   Micro animations inside cards

------------------------------------------------------------------------

## 7. ADVANCED FEATURES

### Heading

Built to Learn and Improve

### Features

Persona Builder\
Identifies ideal audience segments

Message Testing\
Tests hooks and messaging variations

Trend Detection\
Adapts content to trends

Revenue Attribution\
Connects content to revenue

### Animation

-   Neural network style lines
-   Nodes lighting up

------------------------------------------------------------------------

## 8. RESULTS

### Heading

From Guessing to Growth

### Content

-   Find best channels
-   Discover niche
-   Generate leads
-   Increase conversions

### Animation

-   Graph rising
-   Numbers counting up

------------------------------------------------------------------------

## 9. USE CASES

### Heading

Built for Every Growth Stage

### Segments

Startups\
SaaS\
D2C\
Agencies

### Animation

-   Toggle between personas
-   Smooth transitions

------------------------------------------------------------------------

## 10. DASHBOARD

### Heading

See What's Working in Real Time

### Content

-   Channel comparison
-   Performance insights
-   AI recommendations

### Animation

-   Graph drawing animation
-   Notification pop-ins

------------------------------------------------------------------------

## 11. TESTIMONIALS

### Heading

Loved by Founders

### Content

Quotes with growth metrics

### Animation

-   Floating cards
-   Hover zoom

------------------------------------------------------------------------

## 12. CTA

### Heading

Stop Guessing. Start Growing.

### Subtext

Let Guidenco find your growth strategy automatically.

### CTA

Start Free\
Book Demo

### Animation

-   Pulsing button
-   Background glow

------------------------------------------------------------------------

## BEST PRACTICES

-   Build each section as reusable component
-   Use props for dynamic content
-   Keep animations subtle and smooth
-   Lazy load heavy sections
-   Optimize for performance
