import Link from "next/link";
import { Sparkles } from "lucide-react";
import { CtaButton } from "../primitives";

const navItems = [
  { label: "Problem", href: "#problem" },
  { label: "Before/After", href: "#before-after" },
  { label: "Benefits", href: "#benefits" },
  { label: "Audience", href: "#audience" },
  { label: "Results", href: "#results" },
  { label: "FAQ", href: "#faq" },
];

export function LandingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 text-white transition-opacity hover:opacity-90">
          <div className="flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-[0_0_30px_rgba(255,106,0,0.18)]">
            <Sparkles className="size-5 text-[#ff6a00]" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-wide">Guidenco</div>
            <div className="text-xs text-white/45">AI growth engine</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm text-white/65 transition hover:text-white">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <CtaButton href="/auth/sign-in" variant="outline" className="hidden sm:inline-flex">
            Sign In
          </CtaButton>
          <CtaButton href="/book-demo">Book Demo</CtaButton>
        </div>
      </div>
    </header>
  );
}
