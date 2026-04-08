import { ArrowRight, CheckCircle2, Clock3, Sparkles, Target, XCircle } from "lucide-react";

import { LandingSection, SurfaceCard } from "../primitives";

const beforePoints = [
  {
    icon: XCircle,
    title: "Random channel decisions",
    description: "Teams post wherever it feels active instead of where the audience actually converts.",
  },
  {
    icon: Clock3,
    title: "Slow experimentation",
    description: "Every campaign takes too long to plan, publish, and evaluate.",
  },
  {
    icon: Target,
    title: "No clear signal",
    description: "It is hard to tell which messages, formats, or channels are really moving demand.",
  },
];

const afterPoints = [
  {
    icon: CheckCircle2,
    title: "One repeatable growth loop",
    description: "Product context becomes a steady pipeline of tested content and channel experiments.",
  },
  {
    icon: Sparkles,
    title: "Faster learning cycles",
    description: "You can launch, measure, and improve in a tighter loop without the manual drag.",
  },
  {
    icon: Target,
    title: "Clearer ROI and focus",
    description: "Every action feeds a clearer picture of what is working and where to double down.",
  },
];

export function BeforeAfterSection() {
  return (
    <LandingSection
      id="before-after"
      badge="Before vs after"
      title="Move from scattered activity to a system that compounds"
      description="See how Guidenco changes the daily reality of marketing from guesswork and manual effort to a repeatable growth engine."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch lg:gap-8">
        <SurfaceCard className="group relative h-full overflow-hidden border-red-500/15 bg-linear-to-br from-red-500/10 via-white/5 to-transparent p-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.12),transparent_36%)] opacity-80" />
          <div className="relative flex h-full flex-col p-6 sm:p-7">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-red-200/70">Before</div>
                <h3 className="mt-2 text-2xl font-semibold text-white">Manual, unclear, reactive</h3>
              </div>
              <div className="flex size-12 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-300 shadow-[0_12px_32px_rgba(239,68,68,0.12)]">
                <XCircle className="size-6" />
              </div>
            </div>

            <p className="max-w-xl text-sm leading-7 text-white/60">
              Most teams end up guessing where to publish, what to say, and when to double down. That slows growth and makes results hard to explain.
            </p>

            <div className="mt-6 space-y-3">
              {beforePoints.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="flex gap-4 rounded-2xl border border-white/8 bg-black/20 p-4 transition-colors group-hover:border-red-500/20 group-hover:bg-white/4"
                  >
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-red-500/15 bg-red-500/10 text-red-300">
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <h4 className="text-base font-semibold text-white">{item.title}</h4>
                      <p className="mt-1 text-sm leading-6 text-white/60">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100/90">
              Wasted time, scattered execution, and unclear ROI.
            </div>
          </div>
        </SurfaceCard>

        <div className="flex items-center justify-center py-2 lg:py-0">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[#ff6a00] shadow-[0_0_40px_rgba(255,106,0,0.18)]">
            <ArrowRight className="size-6" />
          </div>
        </div>

        <SurfaceCard className="group relative h-full overflow-hidden border-emerald-500/15 bg-linear-to-br from-emerald-500/10 via-white/5 to-transparent p-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.12),transparent_36%)] opacity-80" />
          <div className="relative flex h-full flex-col p-6 sm:p-7">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-200/70">After</div>
                <h3 className="mt-2 text-2xl font-semibold text-white">Guided, measurable, compounding</h3>
              </div>
              <div className="flex size-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 shadow-[0_12px_32px_rgba(34,197,94,0.12)]">
                <CheckCircle2 className="size-6" />
              </div>
            </div>

            <p className="max-w-xl text-sm leading-7 text-white/60">
              Guidenco turns product context into a repeatable workflow for creating, testing, distributing, and improving growth content.
            </p>

            <div className="mt-6 space-y-3">
              {afterPoints.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="flex gap-4 rounded-2xl border border-white/8 bg-black/20 p-4 transition-colors group-hover:border-emerald-500/20 group-hover:bg-white/4"
                  >
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-emerald-500/15 bg-emerald-500/10 text-emerald-300">
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <h4 className="text-base font-semibold text-white">{item.title}</h4>
                      <p className="mt-1 text-sm leading-6 text-white/60">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Faster tests", value: "3x" },
                { label: "Time saved", value: "15 hrs" },
                { label: "Clearer focus", value: "1 system" },
              ].map((metric) => (
                <div key={metric.label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xl font-semibold text-white">{metric.value}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-white/45">{metric.label}</div>
                </div>
              ))}
            </div>
          </div>
        </SurfaceCard>
      </div>
    </LandingSection>
  );
}
