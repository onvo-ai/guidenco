"use client";

import { motion } from "framer-motion";
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
              
              {/* Animated pulse traveling down the line */}
              <motion.div
                className="absolute left-[27px] top-0 h-20 w-[3px] rounded-full bg-[#ff6a00]"
                animate={{ top: ["0%", "100%"], opacity: [0, 1, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              />

              {[
                { title: "Audience Signals", desc: "ICP & intent data", delay: 0 },
                { title: "Message Testing", desc: "Hook performance", delay: 0.2 },
                { title: "Revenue Impact", desc: "Pipeline attribution", delay: 0.4 },
              ].map((node, index) => (
                <motion.div
                  key={node.title}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.2, type: "spring" }}
                  className="relative z-10 flex items-center gap-6"
                >
                  {/* Node point */}
                  <motion.div 
                    animate={{ boxShadow: ["0 0 0px rgba(255,106,0,0)", "0 0 20px rgba(255,106,0,0.5)", "0 0 0px rgba(255,106,0,0)"] }}
                    transition={{ duration: 2, delay: index * 0.5, repeat: Infinity }}
                    className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-[#ff6a00]/30 bg-[#111]"
                  >
                    <div className="size-3 rounded-full bg-[#ff6a00]" />
                  </motion.div>
                  
                  {/* Node content */}
                  <div className="flex flex-1 flex-col justify-center rounded-2xl border border-white/10 bg-black/40 px-5 py-4 backdrop-blur-sm transition-colors hover:border-[#ff6a00]/30 hover:bg-white/[0.02]">
                    <div className="font-semibold text-white">{node.title}</div>
                    <div className="mt-1 text-xs text-white/50">{node.desc}</div>
                  </div>
                </motion.div>
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
          {advancedFeatures.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <SurfaceCard key={feature.title} delay={index * 0.1} className="transition-colors hover:bg-white/[0.02]">
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
