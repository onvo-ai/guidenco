"use client";

import { motion } from "framer-motion";
import { Bot, CirclePlay, Bell, TrendingUp, Users, MessageSquare, Sparkles } from "lucide-react";
import { LandingSection, SurfaceCard } from "../primitives";

const notifications = [
  { icon: TrendingUp, text: "LinkedIn engagement up 24%", color: "#22c55e" },
  { icon: Users, text: "New high-intent leads detected", color: "#3b82f6" },
  { icon: MessageSquare, text: "Top performing message cluster identified", color: "#f59e0b" },
];

export function DashboardSection() {
  return (
    <LandingSection
      badge="Dashboard"
      title="See What's Working in Real Time"
      description="Compare channels, review performance insights, and get AI recommendations for the next best move from one live dashboard."
    >
      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        {/* Main dashboard */}
        <SurfaceCard className="flex flex-col overflow-hidden p-0">
          <div className="flex-1 border-b border-white/10 bg-white/[0.01] p-6 sm:p-8">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium tracking-wide text-white/50">CHANNEL COMPARISON</div>
                <div className="mt-1 text-2xl font-semibold text-white">Performance Overview</div>
              </div>
              <div className="flex size-10 items-center justify-center rounded-xl bg-[#ff6a00]/10">
                <CirclePlay className="size-5 text-[#ff6a00]" />
              </div>
            </div>
            
            {/* Chart */}
            <div className="relative mt-8 flex h-56 items-end gap-2 border-b border-white/10 pb-4 sm:gap-4">
              {/* Chart background grid lines */}
              <div className="absolute inset-x-0 bottom-4 border-t border-dashed border-white/10" />
              <div className="absolute inset-x-0 bottom-[calc(4px+33%)] border-t border-dashed border-white/10" />
              <div className="absolute inset-x-0 bottom-[calc(4px+66%)] border-t border-dashed border-white/10" />
              <div className="absolute inset-x-0 top-0 border-t border-dashed border-white/10" />
              
              {[
                { label: "LinkedIn", value: 85, color: "#0A66C2" },
                { label: "IG", value: 62, color: "#E4405F" },
                { label: "YT", value: 74, color: "#FF0000" },
                { label: "Reddit", value: 45, color: "#FF4500" },
                { label: "Blog", value: 58, color: "#FF6A00" },
              ].map((item, index) => (
                <div key={item.label} className="relative z-10 flex flex-1 flex-col items-center justify-end h-full group">
                  <motion.div
                    initial={{ height: 0 }}
                    whileInView={{ height: `${item.value}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, delay: index * 0.1, type: "spring", bounce: 0.2 }}
                    className="w-full max-w-[48px] rounded-t-md opacity-80 transition-opacity group-hover:opacity-100"
                    style={{ backgroundColor: item.color }}
                  >
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-[#111] px-2 py-1 text-[10px] font-bold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                      {item.value}%
                    </div>
                  </motion.div>
                  <span className="mt-4 text-xs font-medium text-white/50">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* AI Recommendations */}
          <div className="bg-[#111] p-6 sm:p-8">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-[#ff6a00]/15">
                <Bot className="size-4 text-[#ff6a00]" />
              </div>
              <span className="font-semibold text-white">AI Recommendations</span>
            </div>
            <div className="space-y-3">
              {[
                "Double down on LinkedIn thought leadership this week",
                "Repurpose top webinar into YouTube Shorts",
                "Test niche-specific landing page messaging",
              ].map((rec, index) => (
                <motion.div
                  key={rec}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 + index * 0.1 }}
                  className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-[#ff6a00]/30 hover:bg-[#ff6a00]/[0.02]"
                >
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-[#ff6a00]" />
                  <span className="text-sm leading-snug text-white/80">{rec}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </SurfaceCard>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          <SurfaceCard className="flex-1 p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-white/10">
                <Bell className="size-4 text-white" />
              </div>
              <span className="font-semibold text-white">Live Notifications</span>
            </div>
            <div className="space-y-3">
              {notifications.map((notif, index) => {
                const Icon = notif.icon;
                return (
                  <motion.div
                    key={notif.text}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + index * 0.1 }}
                    className="flex items-center gap-4 rounded-xl border border-white/5 bg-black/40 p-4"
                  >
                    <div
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${notif.color}15`, color: notif.color }}
                    >
                      <Icon className="size-5" />
                    </div>
                    <span className="text-sm font-medium text-white/80">{notif.text}</span>
                  </motion.div>
                );
              })}
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-6 sm:p-8 bg-gradient-to-br from-white/[0.05] to-transparent">
            <div className="text-sm font-medium uppercase tracking-wider text-white/50">Active channels</div>
            <div className="mt-3 text-4xl font-bold tracking-tight text-white">5<span className="text-white/30">/5</span></div>
            <div className="mt-2 flex items-center gap-2 text-sm text-[#22c55e]">
              <div className="size-1.5 rounded-full bg-[#22c55e] animate-pulse" />
              All channels healthy
            </div>
          </SurfaceCard>
        </div>
      </div>
    </LandingSection>
  );
}
