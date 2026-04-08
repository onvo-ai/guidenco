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
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {benefits.map((benefit) => {
          const Icon = benefit.icon;
          return (
            <SurfaceCard key={benefit.title} className="h-full">
              <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-[#ff6a00]/10 text-[#ff6a00]">
                <Icon className="size-5" />
              </div>
              <h3 className="text-xl font-semibold text-white">{benefit.title}</h3>
              <p className="mt-3 text-sm leading-7 text-white/60">{benefit.description}</p>
            </SurfaceCard>
          );
        })}
      </div>
    </LandingSection>
  );
}
