"use client";

import { motion } from "framer-motion";
import { Bot, Rocket, Gauge, BarChart3 } from "lucide-react";
import { LandingSection, SurfaceCard } from "../primitives";

const features = [
  {
    title: "AI Content Engine",
    description: "Creates posts, blogs, scripts, and campaign angles automatically from your product context.",
    icon: Bot,
  },
  {
    title: "Multi-platform Publishing",
    description: "Distributes content across your highest-value channels without a fragmented workflow.",
    icon: Rocket,
  },
  {
    title: "Performance Tracking",
    description: "Tracks engagement, channel traction, and conversion signals in one place.",
    icon: Gauge,
  },
  {
    title: "Optimization Loop",
    description: "Improves content, messaging, and distribution based on what actually performs.",
    icon: BarChart3,
  },
];

export function FeaturesSection() {
  return (
    <LandingSection
      id="features"
      badge="Core features"
      title="Everything You Need to Grow"
      description="A focused system for generating, distributing, tracking, and improving growth content."
    >
      <div className="grid gap-6 md:grid-cols-2">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <SurfaceCard key={feature.title} delay={index * 0.1}>
              <div className="mb-6 flex items-center gap-4">
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  className="flex size-14 items-center justify-center rounded-2xl border border-[#ff6a00]/20 bg-[#ff6a00]/10"
                >
                  <Icon className="size-6 text-[#ff6a00]" />
                </motion.div>
                <h3 className="text-xl font-semibold text-white">{feature.title}</h3>
              </div>
              <p className="text-base leading-7 text-white/60">{feature.description}</p>
            </SurfaceCard>
          );
        })}
      </div>
    </LandingSection>
  );
}
