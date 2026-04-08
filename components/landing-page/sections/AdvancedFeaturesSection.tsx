import { Lightbulb, Users, MessageSquareText, TrendingUp } from "lucide-react";
import { LandingSection, SurfaceCard } from "../primitives";

const advancedFeatures = [
  { title: "Persona Builder", description: "Identifies ideal audience segments", icon: Users },
  { title: "Message Testing", description: "Tests hooks and messaging variations", icon: MessageSquareText },
  { title: "Trend Detection", description: "Adapts content to trends", icon: TrendingUp },
  { title: "Revenue Attribution", description: "Connects content to revenue", icon: Lightbulb },
];

export function AdvancedFeaturesSection() {
  return (
    <LandingSection
      badge="Advanced system"
      title="Built to Learn and Improve"
      description="Guidenco goes beyond publishing. It helps you understand who to target, what to say, and what actually drives revenue."
    >
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Neural network visualization */}
        <SurfaceCard className="relative flex min-h-[400px] flex-col overflow-hidden p-0">
          <div className="absolute inset-0 bg-gradient-to-br from-[#ff6a00]/10 to-transparent" />
          
          <div className="relative flex flex-1 flex-col items-center justify-center p-8">
            <div className="relative flex w-full max-w-sm flex-col gap-6">
              
              {/* Connecting vertical line */}
              <div className="absolute bottom-0 left-[28px] top-0 w-px bg-gradient-to-b from-white/20 via-[#ff6a00]/50 to-white/20" />

              {/* Pulse marker */}
              <div className="absolute left-[27px] top-0 h-20 w-[3px] rounded-full bg-[#ff6a00] opacity-80" />

              {[
                { title: "Audience Signals", desc: "ICP & intent data" },
                { title: "Message Testing", desc: "Hook performance" },
                { title: "Revenue Impact", desc: "Pipeline attribution" },
              ].map((node) => (
                <div
                  key={node.title}
                  className="relative z-10 flex items-center gap-6"
                >
                  {/* Node point */}
                  <div 
                    className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-[#ff6a00]/30 bg-[#111]"
                  >
                    <div className="size-3 rounded-full bg-[#ff6a00]" />
                  </div>
                  
                  {/* Node content */}
                  <div className="flex flex-1 flex-col justify-center rounded-2xl border border-white/10 bg-black/40 px-5 py-4 backdrop-blur-sm transition-colors hover:border-[#ff6a00]/30 hover:bg-white/2">
                    <div className="font-semibold text-white">{node.title}</div>
                    <div className="mt-1 text-xs text-white/50">{node.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-white/10 bg-black/20 p-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#ff6a00]/20 bg-[#ff6a00]/10 px-3 py-1 text-xs font-medium text-[#ffb17a]">
              <div className="size-1.5 rounded-full bg-[#ff6a00] animate-pulse" />
              Neural growth layer active
            </div>
          </div>
        </SurfaceCard>

        {/* Advanced features grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:gap-6">
          {advancedFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <SurfaceCard key={feature.title} className="transition-colors hover:bg-white/2">
                <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-[#ff6a00]/15 bg-[#ff6a00]/10 text-[#ff6a00]">
                  <Icon className="size-5" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">{feature.title}</h3>
                <p className="text-sm leading-6 text-white/60">{feature.description}</p>
              </SurfaceCard>
            );
          })}
        </div>
      </div>
    </LandingSection>
  );
}
