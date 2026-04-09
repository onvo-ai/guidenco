import { BarChart3, BrainCircuit, Megaphone, Target } from "lucide-react";

import { LandingSection, SurfaceCard } from "../primitives";

const benefits = [
  {
    title: "Clear positioning",
    description: "Turn product context into messaging that sounds like you and speaks to the market you want.",
    icon: BrainCircuit,
  },
  {
    title: "Faster experiments",
    description: "Generate new hooks, formats, and angles quickly so your team can learn faster than competitors.",
    icon: Target,
  },
  {
    title: "Unified distribution",
    description: "Keep content, publishing, and learning in one place instead of stitching together disconnected tools.",
    icon: Megaphone,
  },
  {
    title: "Better decision-making",
    description: "See what is working across channels and double down on the patterns that actually drive growth.",
    icon: BarChart3,
  },
];

export function BenefitsSection() {
  return (
    <LandingSection
      id="benefits"
      badge="Benefits"
      title="Built to make growth clearer, faster, and more measurable"
      description="Guidenco helps you move from activity to outcome by tightening the loop between strategy, execution, and learning."
    >
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
        <SurfaceCard className="relative overflow-hidden border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,106,0,0.12),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-0">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_0%,rgba(255,255,255,0.03)_50%,transparent_100%)]" />
          <div className="relative flex h-full min-h-[420px] flex-col justify-between p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/35">Growth loop</div>
                <h3 className="mt-3 max-w-md text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Strategy, execution, and learning in one visible system
                </h3>
              </div>
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-[#ff6a00]/20 bg-[#ff6a00]/10 text-[#ff6a00]">
                <BarChart3 className="size-5" />
              </div>
            </div>

            <div className="relative my-10 flex flex-1 items-center justify-center">
              <div className="absolute inset-x-10 top-1/2 h-px -translate-y-1/2 bg-linear-to-r from-transparent via-white/15 to-transparent" />
              <div className="absolute left-10 right-10 top-1/2 h-[220px] -translate-y-1/2 rounded-full border border-dashed border-[#ff6a00]/12" />
              <div className="absolute left-1/2 top-1/2 size-44 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/30 shadow-[0_0_80px_rgba(255,106,0,0.08)]" />

              {[
                { label: "Plan", tone: "text-[#ffb17a]", ring: "bg-[#ff6a00]/15", x: "left-8 top-10" },
                { label: "Publish", tone: "text-white", ring: "bg-white/10", x: "right-8 top-10" },
                { label: "Measure", tone: "text-[#7cb5ff]", ring: "bg-blue-500/15", x: "right-14 bottom-12" },
                { label: "Improve", tone: "text-emerald-300", ring: "bg-emerald-500/15", x: "left-14 bottom-12" },
              ].map((step, index) => (
                <div
                  key={step.label}
                  className={`absolute ${step.x} flex items-center gap-3 rounded-2xl border border-white/10 bg-[#111]/90 px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.22)]`}
                >
                  <div className={`size-3 rounded-full ${step.ring} ${index === 1 ? "animate-pulse" : ""}`} />
                  <span className={`text-sm font-medium ${step.tone}`}>{step.label}</span>
                </div>
              ))}

              <div className="relative z-10 flex size-28 items-center justify-center rounded-full border border-[#ff6a00]/25 bg-[#0b0b0b] text-center shadow-[0_0_40px_rgba(255,106,0,0.16)]">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">AI core</div>
                  <div className="mt-1 text-sm font-semibold text-white">Learns</div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { value: "120+", label: "tests learned from" },
                { value: "18 hrs", label: "saved weekly" },
                { value: "2x", label: "higher engagement" },
              ].map((metric) => (
                <div key={metric.label} className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 backdrop-blur-sm">
                  <div className="text-xl font-semibold text-white">{metric.value}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-white/45">{metric.label}</div>
                </div>
              ))}
            </div>
          </div>
        </SurfaceCard>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            const accentClass =
              index === 0
                ? "from-[#ff6a00]/14 to-transparent"
                : index === 1
                  ? "from-blue-500/14 to-transparent"
                  : index === 2
                    ? "from-emerald-500/14 to-transparent"
                    : "from-white/8 to-transparent";

            return (
              <SurfaceCard
                key={benefit.title}
                delay={index * 0.08}
                className={`relative overflow-hidden border-white/8 bg-linear-to-br ${accentClass} h-full`}
              >
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div className="flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-[#ff6a00]">
                    <Icon className="size-5" />
                  </div>
                  <div className="text-xs uppercase tracking-[0.22em] text-white/35">0{index + 1}</div>
                </div>
                <h3 className="text-xl font-semibold text-white">{benefit.title}</h3>
                <p className="mt-3 text-sm leading-7 text-white/60">{benefit.description}</p>
              </SurfaceCard>
            );
          })}
        </div>
      </div>
    </LandingSection>
  );
}
