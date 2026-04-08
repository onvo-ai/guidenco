import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarDays, CheckCircle2, Sparkles, Target, Zap } from "lucide-react";

import { BookDemoForm } from "@/components/book-demo-form";

export const metadata: Metadata = {
  title: "Book a Demo | Guidenco",
  description:
    "Submit your demo request, share your company details and budget, and we’ll save everything in Notion for follow-up.",
};

const highlights = [
  {
    icon: CheckCircle2,
    title: "Fast response",
    description: "We’ll review your request and reply as soon as possible.",
  },
  {
    icon: Target,
    title: "Right-fit guidance",
    description: "We use your goals and budget to tailor the conversation.",
  },
  {
    icon: Zap,
    title: "Saved in Notion",
    description: "Every submission is captured in your Notion workspace.",
  },
];

export default function BookDemoPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,106,0,0.14),transparent_55%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="size-4" />
            Back to home
          </Link>

          <div className="hidden items-center gap-2 rounded-full border border-[#ff6a00]/20 bg-[#ff6a00]/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.24em] text-white/70 sm:inline-flex">
            <Sparkles className="size-4 text-[#ff6a00]" />
            Demo requests saved to Notion
          </div>
        </header>

        <main className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:py-14">
          <section className="max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">
              <CalendarDays className="size-4 text-[#ff6a00]" />
              Book a demo with Guidenco
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Tell us what you’re trying to grow, and we’ll take it from there.
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-white/65 sm:text-xl">
              Share your name, company, contact details, and marketing budget. We’ll save the request in Notion and use it to prepare for a focused demo.
            </p>

            <div className="mt-10 grid gap-4">
              {highlights.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="flex gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-md"
                  >
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#ff6a00]/10 text-[#ff6a00]">
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">{item.title}</h2>
                      <p className="mt-1 text-sm leading-6 text-white/60">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <BookDemoForm />
        </main>
      </div>
    </div>
  );
}
