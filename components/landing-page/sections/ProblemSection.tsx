"use client";

import { motion } from "framer-motion";
import { AlertCircle, ArrowDownRight, RefreshCcw, Search, Target } from "lucide-react";
import { LandingSection } from "../primitives";

const problemPoints = [
  {
    title: "No clarity on what works",
    description: "Posting everywhere without knowing which channel actually drives pipeline.",
    icon: Search,
  },
  {
    title: "Inconsistent strategy",
    description: "Starting and stopping campaigns because there's no system to sustain them.",
    icon: RefreshCcw,
  },
  {
    title: "Zero feedback loop",
    description: "Treating every post as a one-off instead of learning from the data.",
    icon: AlertCircle,
  },
  {
    title: "Wasted time and budget",
    description: "Burning resources on formats and audiences that don't convert.",
    icon: ArrowDownRight,
  },
];

export function ProblemSection() {
  return (
    <LandingSection
      id="problem"
      badge="The problem"
      title="Most Startups Don't Fail Because of Product"
      description="They fail because they never figure out how to reach the right audience. Growth gets stuck when every channel decision is a guess."
    >
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Messy Dashboard UI */}
        <div className="relative flex min-h-[450px] flex-col overflow-hidden rounded-3xl border border-red-500/20 bg-[#111] p-0 shadow-[0_0_50px_rgba(239,68,68,0.1)]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(239,68,68,0.08),transparent_70%)]" />
          
          <div className="relative z-10 flex flex-1 flex-col p-6 sm:p-8">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider text-red-400">Warning</span>
                </div>
                <h3 className="mt-2 text-xl font-semibold text-white">Scattered Acquisition</h3>
              </div>
              <div className="flex -space-x-2">
                {["#0A66C2", "#E4405F", "#FF0000"].map((color, i) => (
                  <div key={i} className="flex size-8 items-center justify-center rounded-full border-2 border-[#111] bg-white/5" style={{ color }}>
                    <div className="size-3 rounded-full" style={{ backgroundColor: color }} />
                  </div>
                ))}
              </div>
            </div>
            
            {/* Messy Charts Area */}
            <div className="relative flex-1">
              {/* Erratic Line Chart */}
              <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                <motion.path
                  d="M0,50 Q10,20 20,60 T40,30 T60,80 T80,40 T100,70"
                  fill="none"
                  stroke="rgba(239,68,68,0.4)"
                  strokeWidth="2"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                />
                <motion.path
                  d="M0,80 Q15,90 25,40 T50,60 T75,20 T100,50"
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="1.5"
                  strokeDasharray="4,4"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 2, ease: "easeOut" }}
                />
              </svg>

              {/* Failing Metrics Cards */}
              <div className="absolute inset-0 flex flex-col justify-center gap-4 py-8">
                {[
                  { label: "CAC", value: "$480", trend: "+12%", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", width: "w-3/4", x: "translate-x-4" },
                  { label: "Conversion", value: "0.8%", trend: "-2.4%", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", width: "w-2/3", x: "translate-x-12" },
                  { label: "Traffic", value: "12k", trend: "Flat", color: "text-white/50", bg: "bg-white/5", border: "border-white/10", width: "w-4/5", x: "-translate-x-2" },
                ].map((metric, i) => (
                  <motion.div
                    key={i}
                    animate={{ y: [-2, 2, -2], x: i % 2 === 0 ? [-1, 1, -1] : [1, -1, 1] }}
                    transition={{ duration: 3 + i, repeat: Infinity, ease: "easeInOut" }}
                    className={`flex items-center justify-between rounded-xl border ${metric.border} ${metric.bg} p-3 backdrop-blur-md ${metric.width} ${metric.x}`}
                  >
                    <div>
                      <div className="text-[10px] uppercase text-white/50">{metric.label}</div>
                      <div className="text-lg font-bold text-white">{metric.value}</div>
                    </div>
                    <div className={`text-xs font-semibold ${metric.color}`}>
                      {metric.trend}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
            
            {/* Chaos indicator banner */}
            <div className="mt-6 flex items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 py-2 text-xs font-medium text-red-300">
              <Target className="mr-2 size-3" />
              Audience mismatch detected across 3 channels
            </div>
          </div>
        </div>

        {/* Problem points */}
        <div className="flex flex-col justify-center gap-4">
          {problemPoints.map((point, index) => {
            const Icon = point.icon;
            return (
              <motion.div
                key={point.title}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ scale: 1.02, x: -5 }}
                className="group flex items-start gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-5 transition-all hover:border-red-500/30 hover:bg-white/[0.04]"
              >
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/5 text-white/40 transition-colors group-hover:bg-red-500/10 group-hover:text-red-400">
                  <Icon className="size-5" />
                </div>
                <div>
                  <h4 className="text-base font-semibold text-white group-hover:text-red-100">{point.title}</h4>
                  <p className="mt-1 text-sm text-white/60">{point.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </LandingSection>
  );
}
