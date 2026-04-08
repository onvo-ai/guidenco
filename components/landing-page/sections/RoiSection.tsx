import { ArrowUpRight, Clock3, DollarSign, LineChart } from "lucide-react";

import { LandingSection, SurfaceCard } from "../primitives";

const roiSignals = [
  {
    value: "-42%",
    label: "less time spent planning content",
    icon: Clock3,
  },
  {
    value: "+31%",
    label: "more qualified demand from content",
    icon: LineChart,
  },
  {
    value: "2.5x",
    label: "faster experimentation cadence",
    icon: ArrowUpRight,
  },
  {
    value: "$18k",
    label: "estimated annual productivity gains",
    icon: DollarSign,
  },
];

export function RoiSection() {
  return (
    <LandingSection
      id="roi"
      badge="ROI"
      title="See the business impact without waiting months to validate it"
      description="Guidenco is built to reduce wasted effort and help teams connect content output to actual growth signals."
    >
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <SurfaceCard className="flex flex-col justify-between gap-6">
          <div>
            <div className="text-sm font-medium uppercase tracking-[0.24em] text-white/40">ROI model</div>
            <h3 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">More learning, less manual work</h3>
            <p className="mt-4 text-sm leading-7 text-white/60">
              Reduce time spent on repetitive planning and content ops while increasing the speed of useful experiments.
            </p>
          </div>
          <div className="rounded-3xl border border-[#ff6a00]/20 bg-[#ff6a00]/5 p-5">
            <div className="text-sm text-white/50">Typical impact</div>
            <div className="mt-2 text-4xl font-bold tracking-tight text-white">Payback in weeks</div>
            <p className="mt-3 text-sm leading-7 text-white/60">
              The goal is not just more content. The goal is better decisions, faster execution, and clearer revenue leverage.
            </p>
          </div>
        </SurfaceCard>

        <div className="grid gap-4 sm:grid-cols-2">
          {roiSignals.map((signal) => {
            const Icon = signal.icon;
            return (
              <SurfaceCard key={signal.label}>
                <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-[#ff6a00]/10 text-[#ff6a00]">
                  <Icon className="size-5" />
                </div>
                <div className="text-3xl font-bold tracking-tight text-white">{signal.value}</div>
                <p className="mt-2 text-sm leading-7 text-white/60">{signal.label}</p>
              </SurfaceCard>
            );
          })}
        </div>
      </div>
    </LandingSection>
  );
}
