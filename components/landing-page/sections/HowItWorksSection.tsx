import { Brain, Orbit, Sparkles, TrendingUp } from "lucide-react";
import { LandingSection, SurfaceCard } from "../primitives";

const workflowSteps = [
  {
    title: "Understand",
    description: "Analyzes your product, audience, and positioning deeply before suggesting a growth path.",
    icon: Brain,
  },
  {
    title: "Create",
    description: "Generates high-quality posts, videos, blogs, and experiments tailored to your positioning.",
    icon: Sparkles,
  },
  {
    title: "Distribute",
    description: "Publishes across LinkedIn, Instagram, YouTube, Reddit, and blog surfaces from one workflow.",
    icon: Orbit,
  },
  {
    title: "Optimize",
    description: "Learns from engagement signals and continuously improves your content, hooks, and channel mix.",
    icon: TrendingUp,
  },
];

export function HowItWorksSection() {
  return (
    <LandingSection
      id="how-it-works"
      badge="How it works"
      title="A simple loop that gets smarter every cycle"
      description="Guidenco turns your growth workflow into an always-learning pipeline from understanding to optimization."
    >
      <div className="relative mt-8 sm:mt-16">
        {/* Progress line (Desktop only) */}
        <div className="absolute left-[12.5%] right-[12.5%] top-6 hidden h-px bg-white/10 lg:block" />
        
        <div className="grid gap-8 lg:grid-cols-4">
          {workflowSteps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="relative flex flex-col pt-8 lg:pt-12">
                {/* Progress dot (Desktop only) */}
                <div className="absolute left-1/2 top-5 hidden size-2.5 -translate-x-1/2 rounded-full border-2 border-[#111] bg-[#ff6a00] shadow-[0_0_15px_rgba(255,106,0,0.5)] lg:block" />
                
                <SurfaceCard className="relative flex h-full flex-col p-6 sm:p-8">
                  {/* Top gradient border highlight */}
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#ff6a00]/50 to-transparent" />
                  
                  <div className="mb-8 flex items-center justify-between">
                    <div className="flex size-12 items-center justify-center rounded-2xl border border-[#ff6a00]/20 bg-[#ff6a00]/10 text-[#ff6a00] shadow-[inset_0_0_15px_rgba(255,106,0,0.1)]">
                      <Icon className="size-5" />
                    </div>
                    <span className="text-xs font-bold tracking-[0.2em] text-white/30">
                      STEP 0{index + 1}
                    </span>
                  </div>
                  
                  <h3 className="mb-3 text-xl font-semibold text-white">{step.title}</h3>
                  <p className="text-sm leading-7 text-white/60">{step.description}</p>
                </SurfaceCard>
              </div>
            );
          })}
        </div>
      </div>
    </LandingSection>
  );
}
