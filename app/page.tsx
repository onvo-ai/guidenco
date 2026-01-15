import { ArrowRight, Sparkles, Zap, Palette, History, ArrowRightIcon, Download, MessageSquare } from 'lucide-react';
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

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Navbar
        logo={<Palette className="h-6 w-6" />}
        name="Artiste"
        homeUrl="/"
        showNavigation={true}
        customNavigation={
          <Navigation
            menuItems={[
              { title: "Features", isLink: true, href: "#features" },
              { title: "Pricing", isLink: true, href: "#pricing" },
              { title: "FAQ", isLink: true, href: "#faq" },
            ]}
          />
        }
        mobileLinks={[
          { text: "Features", href: "#features" },
          { text: "Pricing", href: "#pricing" },
          { text: "FAQ", href: "#faq" },
        ]}
        actions={[
          { text: "Sign In", href: "/auth/sign-in", isButton: false },
          { text: "Get Started", href: "/app", isButton: true, variant: "default" }
        ]}
      />

      <Hero
        title="Create beautiful digital assets for your website"
        description="Transform your ideas into stunning visuals with AI. Design assets, banners, posters, and more using natural language."
        buttons={[
          { text: "Start Creating", href: "/app", variant: "default", iconRight: <ArrowRight className="ml-2 h-4 w-4" /> },
          { text: "Sign In", href: "/auth/sign-in", variant: "outline" }
        ]}
        badge={
          <Badge variant="outline" className="animate-appear">
            <span className="text-muted-foreground">
              AI powered design tool
            </span>
            <a href={"/app"} className="flex items-center gap-1">
              Get started
              <ArrowRightIcon className="size-3" />
            </a>
          </Badge>
        }
        mockup={
          <Screenshot
            srcLight="/dashboard.webp"
            srcDark="/dashboard.webp"
            alt="Launch UI app screenshot"
            width={1248}
            height={765}
            className="w-full"
          />
        }
      />

      <div id="features">
        <Items
          title="Everything you need to create stunning designs"
          items={[
            {
              title: "AI-Powered Generation",
              description: "Describe what you want in plain English and watch AI bring your vision to life instantly.",
              icon: <Zap className="size-5 stroke-1" />,
            },
            {
              title: "Custom Google Fonts",
              description: "Access thousands of Google Fonts to make your designs truly unique and professional.",
              icon: <Palette className="size-5 stroke-1" />,
            },
            {
              title: "Version History",
              description: "Never lose your work. Browse through all versions and restore any previous design.",
              icon: <History className="size-5 stroke-1" />,
            },
            {
              title: "Real-time Preview",
              description: "See your changes instantly with live preview as you chat with AI.",
              icon: <Sparkles className="size-5 stroke-1" />,
            },
            {
              title: "Export Options",
              description: "Download your designs as PNG or HTML with all fonts and styles included.",
              icon: <ArrowRight className="size-5 stroke-1" />,
            },
            {
              title: "Tailwind CSS",
              description: "All designs use Tailwind CSS for easy customization and modern styling.",
              icon: <Zap className="size-5 stroke-1" />,
            },
            {
              title: "Chat Interface",
              description: "Intuitive chat-based interface makes creating designs as easy as having a conversation.",
              icon: <MessageSquare className="size-5 stroke-1" />,
            },
            {
              title: "Multiple Export Formats",
              description: "Export as high-quality PNG images or clean HTML code ready to use in your projects.",
              icon: <Download className="size-5 stroke-1" />,
            },
          ]}
        />
      </div>

      <div id="pricing">
        <Pricing
          title="Simple, Transparent Pricing"
          description="Start creating for free. No credit card required."
          plans={[
            {
              name: "Free",
              description: "Perfect for trying out Artiste",
              price: 0,
              priceNote: "Free forever",
              cta: {
                variant: "default",
                label: "Get Started",
                href: "/app",
              },
              features: [
                "Unlimited projects",
                "AI-powered design generation",
                "Google Fonts library",
                "Version history",
                "PNG & HTML export",
              ],
              variant: "default",
              className: "hidden lg:flex",
            },
            {
              name: "Basic",
              description: "For individuals and creators",
              price: 19,
              priceNote: "per month",
              cta: {
                variant: "default",
                label: "Coming Soon",
                href: "#",
              },
              features: [
                "Everything in Free",
                "Priority AI processing",
                "Advanced export options",
                "Custom templates",
                "Email support",
                "Remove watermarks",
              ],
              variant: "glow-brand",
            },
            {
              name: "Pro",
              description: "For teams and professionals",
              price: 39,
              priceNote: "per month",
              cta: {
                variant: "default",
                label: "Coming Soon",
                href: "#",
              },
              features: [
                "Everything in Basic",
                "Team collaboration",
                "Unlimited team members",
                "Priority support",
                "Custom branding",
                "API access",
              ],
              variant: "glow",
            },
          ]}
        />
      </div>

      <div id="faq">
        <FAQ
          title="Frequently Asked Questions"
          items={[
            {
              question: "How does AI-powered design work?",
              answer: (
                <p className="text-muted-foreground max-w-[640px]">
                  Simply describe what you want to create in natural language. Our AI understands your requirements and generates beautiful designs using HTML, Tailwind CSS, and FontAwesome icons. You can iterate and refine your design through conversation.
                </p>
              ),
            },
            {
              question: "Can I use custom fonts in my designs?",
              answer: (
                <p className="text-muted-foreground max-w-[640px]">
                  Yes! You can use any font from Google Fonts library. Just mention the font name in your request, and the AI will automatically load and apply it to your design. All fonts are included when you export your design.
                </p>
              ),
            },
            {
              question: "What formats can I export my designs in?",
              answer: (
                <p className="text-muted-foreground max-w-[640px]">
                  You can export your designs as PNG images or HTML files. PNG exports are perfect for sharing on social media or using in presentations. HTML exports include all the code, fonts, and styles so you can use them in your own projects.
                </p>
              ),
            },
            {
              question: "Is there a limit to how many designs I can create?",
              answer: (
                <p className="text-muted-foreground max-w-[640px]">
                  No limits! Create as many projects and designs as you want. Each project maintains its own version history, so you can always go back to previous iterations of your designs.
                </p>
              ),
            },
          ]}
        />
      </div>

      <Section className="group relative overflow-hidden">
        <div className="max-w-container relative z-10 mx-auto flex flex-col items-center gap-6 text-center sm:gap-8">
          <h2 className="max-w-[640px] text-3xl leading-tight font-semibold sm:text-5xl sm:leading-tight">
            Ready to Create Something Amazing?
          </h2>
          <div className="max-w-3xl space-y-4">
            <p className="text-muted-foreground text-lg sm:text-xl">
              Join thousands of creators, designers, and marketers who are already using Artiste to bring their ideas to life. Whether you're creating social media graphics, banners, posters, or custom designs, our AI-powered platform makes it effortless.
            </p>
            <p className="text-muted-foreground text-base sm:text-lg">
              Start creating for free today—no credit card required, no commitments. Experience the power of AI-driven design and see why creators love Artiste.
            </p>
          </div>
          <div className="flex justify-center gap-4">
            <a href="/app" className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8">
              Get Started for Free
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </div>
        </div>
        <div className="absolute top-0 left-0 h-full w-full translate-y-[1rem] opacity-80 transition-all duration-500 ease-in-out group-hover:translate-y-[-2rem] group-hover:opacity-100">
          <Glow variant="bottom" />
        </div>
      </Section>

      <Footer
        logo={<Palette className="h-6 w-6" />}
        name="Artiste"
        columns={[
          {
            title: "Product",
            links: [
              { text: "Features", href: "/#features" },
              { text: "Pricing", href: "/#pricing" },
              { text: "FAQ", href: "/#faq" },
            ],
          },
          {
            title: "Company",
            links: [
              { text: "About", href: "/about" },
              { text: "Contact", href: "/contact" },
            ],
          },
        ]}
        copyright="© 2025 Onvo AI. All rights reserved."
      />
    </div>
  );
}
