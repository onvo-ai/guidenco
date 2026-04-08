"use client";

import { motion } from "framer-motion";
import { Bot, Rocket, Gauge, BarChart3 } from "lucide-react";
import { LandingSection, SurfaceCard } from "../primitives";

const features = [
  {
    title: "AI Content Engine",
    description: "Creates posts, blogs, scripts, and campaign angles automatically from your product context.",
    icon: Bot,
    tag: "Create",
    stat: "Drafts in minutes",
    accent: "from-[#ff6a00]/20 via-[#ff6a00]/10 to-transparent",
    bars: [72, 54, 86, 64],
    bullets: ["Posts", "Blogs", "Scripts"],
  },
  {
    title: "Multi-platform Publishing",
    description: "Distributes content across your highest-value channels without a fragmented workflow.",
    icon: Rocket,
    tag: "Distribute",
    stat: "Across every channel",
    accent: "from-[#3b82f6]/20 via-[#3b82f6]/10 to-transparent",
    bars: [48, 68, 58, 84],
    bullets: ["LinkedIn", "YouTube", "Blogs"],
  },
  {
    title: "Performance Tracking",
    description: "Tracks engagement, channel traction, and conversion signals in one place.",
    icon: Gauge,
    tag: "Measure",
    stat: "Signal to pipeline",
    accent: "from-[#22c55e]/20 via-[#22c55e]/10 to-transparent",
    bars: [42, 66, 74, 56],
    bullets: ["Engagement", "Leads", "Conversions"],
  },
  {
    title: "Optimization Loop",
    description: "Improves content, messaging, and distribution based on what actually performs.",
    icon: BarChart3,
    tag: "Improve",
    stat: "Always learning",
    accent: "from-[#f59e0b]/20 via-[#f59e0b]/10 to-transparent",
    bars: [36, 58, 80, 90],
    bullets: ["Hooks", "Formats", "Distribution"],
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
      <div className="grid gap-6 md:grid-cols-2 xl:gap-7">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08, duration: 0.45 }}
              whileHover={{ y: -6 }}
              className="h-full"
            >
              <SurfaceCard className={`group relative h-full overflow-hidden border-white/10 bg-linear-to-br ${feature.accent} p-0`}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_35%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="absolute right-0 top-0 h-28 w-28 translate-x-1/3 -translate-y-1/3 rounded-full bg-[#ff6a00]/10 blur-3xl transition-transform duration-300 group-hover:scale-125" />

                <div className="relative flex h-full flex-col p-6 sm:p-7">
                  <div className="mb-6 flex items-start justify-between gap-4">
                    <motion.div
                      whileHover={{ scale: 1.08, rotate: 4 }}
                      className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-[#ff6a00]/20 bg-[#ff6a00]/10 shadow-[0_12px_40px_rgba(255,106,0,0.12)]"
                    >
                      <Icon className="size-6 text-[#ff6a00]" />
                    </motion.div>

                    <div className="text-right">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/35">{feature.tag}</div>
                      <div className="mt-1 text-sm font-medium text-white/80">{feature.stat}</div>
                    </div>
                  </div>

                  <h3 className="text-xl font-semibold text-white sm:text-2xl">{feature.title}</h3>
                  <p className="mt-3 max-w-md text-base leading-7 text-white/60">{feature.description}</p>

                  <div className="mt-6 flex flex-wrap gap-2">
                    {feature.bullets.map((bullet) => (
                      <span
                        key={bullet}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-white/55"
                      >
                        {bullet}
                      </span>
                    ))}
                  </div>

                  <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-sm">
                    <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-white/35">
                      <span>Momentum</span>
                      <span>Live</span>
                    </div>
                    <div className="flex h-12 items-end gap-2">
                      {feature.bars.map((barHeight, barIndex) => (
                        <motion.div
                          key={`${feature.title}-${barIndex}`}
                          initial={{ height: 0 }}
                          whileInView={{ height: `${barHeight}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.7, delay: 0.15 + barIndex * 0.05 }}
                          className="flex-1 rounded-t-full bg-linear-to-t from-[#ff6a00] to-[#ffb17a] shadow-[0_0_18px_rgba(255,106,0,0.2)]"
                        />
                      ))}
                    </div>
                  </div>
                </div>
            </SurfaceCard>
            </motion.div>
          );
        })}
      </div>
    </LandingSection>
  );
}
