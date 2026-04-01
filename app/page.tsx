import {
  ArrowRight,
  ArrowRightIcon,
  Bot,
  CheckCircle2,
  Code2,
  Download,
  FileImage,
  FileText,
  History,
  Layers3,
  MessageSquare,
  Palette,
  PlaySquare,
  RefreshCcw,
  Search,
  Shield,
  Sparkles,
  Wand2,
} from 'lucide-react';
import Navbar from '@/components/sections/navbar/default';
import Navigation from '@/components/ui/navigation';
import Hero from '@/components/sections/hero/default';
import Items from '@/components/sections/items/default';
import Pricing from '@/components/sections/pricing/default';
import FAQ from '@/components/sections/faq/default';
import CTA from '@/components/sections/cta/default';
import Footer from '@/components/sections/footer/default';
import { Badge } from '@/components/ui/badge';
import Screenshot from '@/components/ui/screenshot';
import { Section } from '@/components/ui/section';
import Glow from '@/components/ui/glow';

const featureHighlights = [
  'Generate graphics, documents, and visual assets from plain English prompts',
  'Work inside a project-based workspace with persistent version history',
  'Export polished outputs as PNG or production-ready HTML and Tailwind CSS',
  'Iterate with an AI chat loop that can inspect, revise, and refine your asset',
];

const workflowSteps = [
  {
    title: 'Prompt the asset you need',
    description: 'Start with a banner, social graphic, landing page section, flyer, product visual, or document layout.',
  },
  {
    title: 'Watch Guidenco build and revise',
    description: 'The model generates structured HTML and styling, then keeps iterating through a chat-driven workflow.',
  },
  {
    title: 'Export or keep refining',
    description: 'Ship a PNG fast, or take the generated HTML/Tailwind output into your product and keep customizing it.',
  },
];

const bentoCards = [
  {
    title: 'Built for developers and marketers',
    description: 'Guidenco bridges visual generation and production output so you can move from prompt to usable asset without hopping tools.',
    icon: <Code2 className="size-5" />,
    className: 'lg:col-span-2',
  },
  {
    title: 'Chat-first creation',
    description: 'Refine layouts, copy, colors, spacing, and style direction through natural language instead of manual editing.',
    icon: <MessageSquare className="size-5" />,
    className: 'lg:col-span-1',
  },
  {
    title: 'Visual assets with structure',
    description: 'Generate banners, posters, launch graphics, and page sections with HTML and Tailwind under the hood.',
    icon: <FileImage className="size-5" />,
    className: 'lg:col-span-1',
  },
  {
    title: 'Project workspaces that keep context',
    description: 'Organize assets by project, continue previous conversations, and keep your creative workflow centralized.',
    icon: <Layers3 className="size-5" />,
    className: 'lg:col-span-1',
  },
  {
    title: 'Version history and safe iteration',
    description: 'Explore directions aggressively, compare revisions, and roll back when a previous version was the better one.',
    icon: <RefreshCcw className="size-5" />,
    className: 'lg:col-span-1',
  },
  {
    title: 'Ready to publish or hand off',
    description: 'Download an image for distribution or export code that developers can drop into a product or landing page.',
    icon: <Download className="size-5" />,
    className: 'lg:col-span-2',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar
        logo={<Palette className="h-6 w-6" />}
        name="Guidenco"
        homeUrl="/"
        showNavigation={true}
        customNavigation={
          <Navigation
            menuItems={[
              { title: 'Features', isLink: true, href: '#features' },
              { title: 'Workflow', isLink: true, href: '#workflow' },
              { title: 'Pricing', isLink: true, href: '#pricing' },
              { title: 'FAQ', isLink: true, href: '#faq' },
            ]}
          />
        }
        mobileLinks={[
          { text: 'Features', href: '#features' },
          { text: 'Workflow', href: '#workflow' },
          { text: 'Pricing', href: '#pricing' },
          { text: 'FAQ', href: '#faq' },
        ]}
        actions={[
          { text: 'Sign In', href: '/auth/sign-in', isButton: false },
          { text: 'Launch App', href: '/app', isButton: true, variant: 'default' },
        ]}
      />

      <Hero
        title="Describe the asset you need. Guidenco turns it into something you can ship."
        description="Create banners, social graphics, documents, launch visuals, and web-ready creative assets with an AI workflow that outputs polished PNGs and clean HTML/Tailwind CSS."
        buttons={[
          {
            text: 'Start Creating',
            href: '/app',
            variant: 'default',
            iconRight: <ArrowRight className="ml-2 h-4 w-4" />,
          },
          { text: 'Sign In', href: '/auth/sign-in', variant: 'outline' },
        ]}
        badge={
          <Badge variant="outline" className="animate-appear">
            <span className="text-muted-foreground">AI asset generation for developers, creators, and lean teams</span>
            <a href="/app" className="flex items-center gap-1">
              Open app
              <ArrowRightIcon className="size-3" />
            </a>
          </Badge>
        }
        mockup={
          <Screenshot
            srcLight="/dashboard.webp"
            srcDark="/dashboard.webp"
            alt="Guidenco dashboard preview"
            width={1248}
            height={765}
            className="w-full"
          />
        }
      />

      <Section className="pt-8 sm:pt-12 md:pt-16">
        <div className="max-w-container mx-auto grid gap-6 rounded-3xl border bg-card/60 p-6 backdrop-blur sm:p-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-5">
            <Badge variant="outline">Why teams pick Guidenco</Badge>
            <h2 className="text-3xl leading-tight font-semibold sm:text-5xl sm:leading-tight">
              Faster than template hunting. More usable than image-only AI tools.
            </h2>
            <p className="text-muted-foreground max-w-2xl text-base sm:text-lg">
              Guidenco is built for the moments when you need a polished visual now, but you also need enough structure to keep editing, exporting, and shipping with confidence.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {featureHighlights.map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-2xl border bg-background/70 p-4">
                <CheckCircle2 className="text-primary mt-0.5 size-5 shrink-0" />
                <p className="text-sm font-medium sm:text-base">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <div id="features">
        <Items
          title="Everything you need to go from idea to finished asset"
          items={[
            {
              title: 'Agentic asset generation',
              description: 'Describe what you want in plain English and let Guidenco generate structured visual output in a single workflow.',
              icon: <Bot className="size-5 stroke-1" />,
            },
            {
              title: 'Project-based workspace',
              description: 'Keep every asset, revision, and conversation grouped inside persistent projects instead of starting over each time.',
              icon: <Layers3 className="size-5 stroke-1" />,
            },
            {
              title: 'Chat-driven revisions',
              description: 'Change layout, rewrite copy, swap styles, or improve composition by simply asking for what you want next.',
              icon: <MessageSquare className="size-5 stroke-1" />,
            },
            {
              title: 'HTML and Tailwind output',
              description: 'Get assets rendered with modern web styling so developers can use the generated output beyond a static preview.',
              icon: <Code2 className="size-5 stroke-1" />,
            },
            {
              title: 'Version history',
              description: 'Branch creatively without risk and jump back to a previous revision whenever you want.',
              icon: <History className="size-5 stroke-1" />,
            },
            {
              title: 'Search and enrich visuals',
              description: 'Bring in supporting imagery and visual ingredients as you guide the AI toward a more polished result.',
              icon: <Search className="size-5 stroke-1" />,
            },
            {
              title: 'Production-ready exports',
              description: 'Download PNGs for immediate use or export clean HTML for embedding into real projects and campaigns.',
              icon: <Download className="size-5 stroke-1" />,
            },
            {
              title: 'Modern styling system',
              description: 'Use Tailwind-based output, rich typography, and web-native composition instead of fighting inflexible templates.',
              icon: <Sparkles className="size-5 stroke-1" />,
            },
          ]}
        />
      </div>

      <Section className="overflow-hidden">
        <div className="max-w-container mx-auto flex flex-col gap-6 sm:gap-8">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
            <Badge variant="outline">Launch UI style bento grid</Badge>
            <h2 className="text-3xl leading-tight font-semibold sm:text-5xl sm:leading-tight">
              One product, multiple ways to ship faster
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg">
              Whether you are launching a product, creating client assets, or building content at speed, Guidenco helps you keep the velocity of AI without losing the usability of structured output.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {bentoCards.map((card) => (
              <div
                key={card.title}
                className={`relative overflow-hidden rounded-3xl border bg-card p-6 sm:p-8 ${card.className}`}
              >
                <div className="relative z-10 flex h-full flex-col justify-between gap-8">
                  <div className="space-y-4">
                    <div className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-2xl border">
                      {card.icon}
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xl font-semibold sm:text-2xl">{card.title}</h3>
                      <p className="text-muted-foreground max-w-xl text-sm sm:text-base">{card.description}</p>
                    </div>
                  </div>
                  <div className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                    <Wand2 className="size-4" />
                    AI-assisted and workflow-ready
                  </div>
                </div>
                <Glow variant="bottom" className="opacity-60" />
              </div>
            ))}
          </div>
        </div>
      </Section>

      <div id="workflow">
        <Section className="bg-card/30">
          <div className="max-w-container mx-auto grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div className="space-y-4">
              <Badge variant="outline">How it works</Badge>
              <h2 className="text-3xl leading-tight font-semibold sm:text-5xl sm:leading-tight">
                A workflow that feels simple upfront and powerful underneath
              </h2>
              <p className="text-muted-foreground max-w-2xl text-base sm:text-lg">
                Guidenco combines conversational prompting, structured generation, iterative revisions, and export-ready output into one loop so you can create without rebuilding from scratch every time.
              </p>
            </div>
            <div className="grid gap-4">
              {workflowSteps.map((step, index) => (
                <div key={step.title} className="rounded-3xl border bg-background p-5 sm:p-6">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-full text-sm font-semibold">
                      {index + 1}
                    </div>
                    <h3 className="text-lg font-semibold sm:text-xl">{step.title}</h3>
                  </div>
                  <p className="text-muted-foreground text-sm sm:text-base">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </div>

      <Section>
        <div className="max-w-container mx-auto grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border bg-card p-6 sm:p-8">
            <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border bg-background">
              <FileText className="size-5" />
            </div>
            <h3 className="text-xl font-semibold">Documents and layouts</h3>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base">
              Generate flyers, posters, announcements, and structured design layouts that stay editable as the asset evolves.
            </p>
          </div>
          <div className="rounded-3xl border bg-card p-6 sm:p-8">
            <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border bg-background">
              <PlaySquare className="size-5" />
            </div>
            <h3 className="text-xl font-semibold">Creative workflows in one place</h3>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base">
              Keep generation, review, export, and iteration inside a single app instead of stitching together disconnected tools.
            </p>
          </div>
          <div className="rounded-3xl border bg-card p-6 sm:p-8">
            <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border bg-background">
              <Shield className="size-5" />
            </div>
            <h3 className="text-xl font-semibold">Built for repeatable delivery</h3>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base">
              Use Guidenco when speed matters, but consistency, traceability, and production handoff still need to hold up.
            </p>
          </div>
        </div>
      </Section>

      <div id="pricing">
        <Pricing
          title="Pricing that lets you start now and scale later"
          description="Begin with the free workflow today, then unlock more power as premium tiers roll out. No credit card required to get started."
          plans={[
            {
              name: 'Free',
              description: 'For founders, developers, and creators validating the workflow',
              price: 0,
              priceNote: 'Free forever',
              cta: {
                variant: 'default',
                label: 'Start for free',
                href: '/app',
              },
              features: [
                'Unlimited projects',
                'Agentic asset generation',
                'Chat-based revisions',
                'Version history',
                'PNG and HTML export',
              ],
              variant: 'default',
              className: 'hidden lg:flex',
            },
            {
              name: 'Basic',
              description: 'For individuals producing assets every week',
              price: 19,
              priceNote: 'per month when released',
              cta: {
                variant: 'outline',
                label: 'Coming soon',
                href: '#pricing',
              },
              features: [
                'Everything in Free',
                'Priority generation',
                'Higher export limits',
                'More advanced asset workflows',
                'Faster support turnaround',
                'Commercial polish for recurring use',
              ],
              variant: 'popular',
            },
            {
              name: 'Pro',
              description: 'For teams, studios, and product organizations',
              price: 39,
              priceNote: 'per month when released',
              cta: {
                variant: 'outline',
                label: 'Coming soon',
                href: '#pricing',
              },
              features: [
                'Everything in Basic',
                'Team-oriented workflows',
                'More scalable creative throughput',
                'Priority support',
                'Advanced controls and integrations',
                'Designed for production teams',
              ],
              variant: 'default',
            },
          ]}
        />
      </div>

      <div id="faq">
        <FAQ
          title="Frequently asked questions"
          items={[
            {
              question: 'What exactly can I create with Guidenco?',
              answer: (
                <p className="text-muted-foreground max-w-[640px]">
                  Guidenco is built for digital assets like banners, posters, launch graphics, social media visuals, structured documents, and web-ready creative sections. The product is especially useful when you need something polished quickly but still want exportable, editable output.
                </p>
              ),
            },
            {
              question: 'How is this different from Canva or image-only AI tools?',
              answer: (
                <p className="text-muted-foreground max-w-[640px]">
                  Canva is template-first, while many AI image tools are great for inspiration but weak for structured delivery. Guidenco is different because it uses a conversational workflow to produce assets you can export as PNG or as clean HTML and Tailwind CSS, which makes it much more useful for developers and fast-moving teams.
                </p>
              ),
            },
            {
              question: 'Do I need design experience to use it well?',
              answer: (
                <p className="text-muted-foreground max-w-[640px]">
                  No. The main interface is chat-driven, so you can work in natural language. If you know exactly what you want, you can be very specific. If you do not, you can iterate with the AI until the direction becomes clear.
                </p>
              ),
            },
            {
              question: 'What export options are available today?',
              answer: (
                <p className="text-muted-foreground max-w-[640px]">
                  You can export assets as PNG images for immediate sharing and publishing, or export HTML for a web-native handoff. That makes Guidenco useful not just for final visuals, but also for developer workflows and landing page production.
                </p>
              ),
            },
            {
              question: 'Can I go back to an earlier version of an asset?',
              answer: (
                <p className="text-muted-foreground max-w-[640px]">
                  Yes. Guidenco keeps version history so you can compare iterations, recover stronger concepts, and avoid losing a direction that worked better than the latest edit.
                </p>
              ),
            },
            {
              question: 'Is Guidenco only for developers?',
              answer: (
                <p className="text-muted-foreground max-w-[640px]">
                  No, but developers get a special advantage because the product can export structured web output. Creators, marketers, indie hackers, and small teams can still use it simply as a faster way to produce polished campaign and content assets.
                </p>
              ),
            },
            {
              question: 'How do projects help with ongoing work?',
              answer: (
                <p className="text-muted-foreground max-w-[640px]">
                  Projects keep related assets, revisions, and context together. That matters when you are building recurring campaigns, launch assets, or multiple iterations of the same visual system over time.
                </p>
              ),
            },
            {
              question: 'Can I start using it for free?',
              answer: (
                <p className="text-muted-foreground max-w-[640px]">
                  Yes. You can get started with the free workflow right now and create assets without entering a credit card. Premium tiers are positioned for heavier usage and additional capabilities as they roll out.
                </p>
              ),
            },
          ]}
        />
      </div>

      <CTA
        title="Create the next asset in minutes, not after another design backlog."
        buttons={[
          {
            href: '/app',
            text: 'Open Guidenco',
            variant: 'default',
            iconRight: <ArrowRight className="ml-2 h-4 w-4" />,
          },
          {
            href: '/auth/sign-in',
            text: 'Sign In',
            variant: 'outline',
          },
        ]}
      />

      <Footer
        logo={<Palette className="h-6 w-6" />}
        name="Guidenco"
        columns={[
          {
            title: 'Product',
            links: [
              { text: 'Features', href: '/#features' },
              { text: 'Workflow', href: '/#workflow' },
              { text: 'Pricing', href: '/#pricing' },
              { text: 'FAQ', href: '/#faq' },
            ],
          },
          {
            title: 'Platform',
            links: [
              { text: 'Open App', href: '/app' },
              { text: 'Sign In', href: '/auth/sign-in' },
              { text: 'Sign Up', href: '/auth/sign-up' },
            ],
          },
        ]}
        copyright="© 2025 Onvo AI. All rights reserved."
      />
    </div>
  );
}
