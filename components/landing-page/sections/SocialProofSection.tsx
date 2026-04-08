import { Award, Building2, ShieldCheck, Star } from "lucide-react";

import { LandingSection, SurfaceCard } from "../primitives";

const proofPoints = [
  {
    value: "120+",
    label: "growth experiments tracked",
    icon: Star,
  },
  {
    value: "18 hrs",
    label: "saved per week on manual planning",
    icon: ShieldCheck,
  },
  {
    value: "4.8/5",
    label: "average team satisfaction",
    icon: Award,
  },
  {
    value: "3x",
    label: "faster content iteration cycles",
    icon: Building2,
  },
];

const proofBars = [
  "Founders use it to validate messaging faster",
  "Growth teams use it to unify content ops",
  "Agencies use it to prove measurable outcomes",
];

export function SocialProofSection() {
  return (
    <LandingSection
      id="social-proof"
      badge="Social proof"
      title="Teams use Guidenco to turn scattered effort into repeatable growth"
      description="Built for teams that need a clear system for content, distribution, and learning — not another dashboard that only adds noise."
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-4 sm:grid-cols-2">
          {proofPoints.map((point) => {
            const Icon = point.icon;
            return (
              <SurfaceCard key={point.label} className="flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#ff6a00]/10 text-[#ff6a00]">
                  <Icon className="size-5" />
                </div>
                <div>
                  <div className="text-3xl font-bold tracking-tight text-white">{point.value}</div>
                  <div className="mt-1 text-sm leading-6 text-white/60">{point.label}</div>
                </div>
              </SurfaceCard>
            );
          })}
        </div>

        <SurfaceCard className="flex flex-col justify-between gap-6">
          <div>
            <div className="text-sm font-medium uppercase tracking-[0.24em] text-white/40">Trusted outcomes</div>
            <h3 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">What teams consistently report</h3>
          </div>
          <div className="space-y-3">
            {proofBars.map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/70">
                <span className="size-2 rounded-full bg-[#ff6a00]" />
                {item}
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>
    </LandingSection>
  );
}
