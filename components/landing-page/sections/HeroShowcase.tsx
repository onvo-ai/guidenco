"use client";

import { motion } from "framer-motion";
import { BarChart3, MessageSquare, RefreshCcw, Sparkles } from "lucide-react";

export function HeroShowcase() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, delay: 0.2 }}
      className="relative mx-auto mt-12 w-full max-w-5xl"
    >
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#111111]/80 shadow-[0_0_80px_rgba(255,106,0,0.15)] backdrop-blur-xl">
        <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-3">
          <div className="flex gap-1.5">
            <div className="size-3 rounded-full bg-red-500/80" />
            <div className="size-3 rounded-full bg-yellow-500/80" />
            <div className="size-3 rounded-full bg-green-500/80" />
          </div>
          <div className="mx-auto flex items-center gap-2 rounded-md bg-black/50 px-3 py-1">
            <Sparkles className="size-3 text-[#ff6a00]" />
            <span className="text-xs text-white/50">guidenco.ai/workspace</span>
          </div>
        </div>

        <div className="grid gap-px bg-white/5 sm:grid-cols-[250px_1fr]">
          <div className="hidden bg-[#0a0a0a] p-6 sm:block">
            <div className="mb-6 flex items-center gap-3 text-white">
              <div className="flex size-8 items-center justify-center rounded-lg bg-[#ff6a00]/20 text-[#ff6a00]">
                <BarChart3 className="size-4" />
              </div>
              <span className="font-medium">Active Campaigns</span>
            </div>
            <div className="space-y-4">
              {[
                { name: "Q1 Launch", status: "Running", color: "bg-green-500" },
                { name: "Founder POV", status: "Testing", color: "bg-yellow-500" },
                { name: "Feature Update", status: "Draft", color: "bg-white/20" },
              ].map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between rounded-lg border border-white/5 bg-white/2 p-3"
                >
                  <span className="text-sm text-white/80">{item.name}</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`size-1.5 rounded-full ${item.color} ${item.status === "Running" ? "animate-pulse" : ""}`}
                    />
                    <span className="text-[10px] text-white/40">{item.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden bg-[#111111] p-6 sm:p-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,106,0,0.05),transparent_80%)]" />

            <div className="relative z-10 mx-auto max-w-2xl">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="mb-8 ml-auto mr-12 max-w-sm rounded-2xl rounded-tr-sm bg-[#ff6a00] p-4 text-white shadow-lg"
              >
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-white/80">
                  Growth Engine
                </div>
                <p className="text-sm">
                  I&apos;ve analyzed your recent product update. Based on current trends, a technical deep-dive thread performs 40% better on LinkedIn for your audience.
                </p>
              </motion.div>

              <div className="relative h-12 w-full">
                <motion.div
                  className="absolute right-24 top-0 h-full w-px bg-linear-to-b from-[#ff6a00] to-transparent"
                  initial={{ height: 0 }}
                  whileInView={{ height: "100%" }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: 1 }}
                />
              </div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 1.5 }}
                className="relative ml-12 rounded-2xl border border-white/10 bg-[#1a1a1a] p-5 shadow-xl"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center rounded-full bg-blue-500/20 text-blue-400">
                      <MessageSquare className="size-4" />
                    </div>
                    <span className="text-sm font-medium text-white">Generating post structure</span>
                  </div>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                  >
                    <RefreshCcw className="size-4 text-white/40" />
                  </motion.div>
                </div>

                <div className="space-y-3">
                  <motion.div
                    className="h-3 rounded-full bg-white/10"
                    initial={{ width: 0 }}
                    whileInView={{ width: "80%" }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, delay: 2 }}
                  />
                  <motion.div
                    className="h-3 rounded-full bg-white/10"
                    initial={{ width: 0 }}
                    whileInView={{ width: "60%" }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, delay: 2.2 }}
                  />
                  <motion.div
                    className="h-3 rounded-full bg-white/10"
                    initial={{ width: 0 }}
                    whileInView={{ width: "90%" }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, delay: 2.4 }}
                  />
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
