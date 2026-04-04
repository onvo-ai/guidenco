"use client";

import { motion } from "framer-motion";
import { TrendingUp, Target, Users, Zap } from "lucide-react";
import { LandingSection, SurfaceCard } from "../primitives";

const results = [
  { label: "Find best channels", icon: Target, value: "+47%" },
  { label: "Discover niche", icon: Users, value: "3x" },
  { label: "Generate leads", icon: Zap, value: "+156%" },
  { label: "Increase conversions", icon: TrendingUp, value: "+89%" },
];

export function ResultsSection() {
  return (
    <LandingSection
      id="results"
      badge="Results"
      title="From Guessing to Growth"
      description="Use the system to uncover what works, double down on it, and convert attention into measurable business outcomes."
    >
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Rising graph */}
        <SurfaceCard>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <div className="text-sm text-white/50">Growth trajectory</div>
              <div className="text-2xl font-semibold text-white">Signals turn into strategy</div>
            </div>
            <TrendingUp className="size-8 text-[#ff6a00]" />
          </div>
          
          <div className="flex h-48 items-end gap-2">
            {[35, 45, 42, 58, 55, 72, 68, 85, 82, 95].map((height, index) => (
              <motion.div
                key={index}
                initial={{ height: 0 }}
                whileInView={{ height: `${height}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: index * 0.1, type: "spring" }}
                className="flex-1 rounded-t bg-gradient-to-t from-[#ff6a00] to-[#ffb17a]"
              />
            ))}
          </div>
          
          <div className="mt-4 flex justify-between text-xs text-white/40">
            <span>Week 1</span>
            <span>Week 10</span>
          </div>
        </SurfaceCard>

        {/* Result metrics */}
        <div className="grid gap-4 sm:grid-cols-2">
          {results.map((result, index) => {
            const Icon = result.icon;
            return (
              <SurfaceCard key={result.label} delay={index * 0.1}>
                <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-[#ff6a00]/10 text-[#ff6a00]">
                  <Icon className="size-6" />
                </div>
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + index * 0.1, type: "spring" }}
                  className="mb-1 text-3xl font-bold text-white"
                >
                  {result.value}
                </motion.div>
                <div className="text-sm text-white/60">{result.label}</div>
              </SurfaceCard>
            );
          })}
        </div>
      </div>
    </LandingSection>
  );
}
