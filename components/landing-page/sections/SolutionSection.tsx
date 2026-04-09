"use client";

import { motion } from "framer-motion";
import { BarChart3, CheckCircle2, MessageSquare, RefreshCcw, Sparkles } from "lucide-react";
import { LandingSection } from "../primitives";

const solutionPoints = [
  "Centralized product understanding",
  "Experiment-driven content generation",
  "Cross-channel distribution logic",
  "Continuous optimization based on live data",
];

export function SolutionSection() {
  return (
    <LandingSection
      id="solution"
      badge="The solution"
      title="Guidenco Removes the Guesswork"
      description="Instead of guessing channels, formats, and messaging every week, you get a system that turns product context into repeatable experiments and compounding learnings."
    >
      <div className="flex flex-col items-center gap-16 lg:flex-row">
        {/* Solution points - New Left Side Layout */}
        <div className="flex w-full flex-col justify-center gap-6 lg:w-1/3">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mb-4 inline-flex w-fit rounded-full border border-[#ff6a00]/30 bg-[#ff6a00]/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-[#ffb17a]"
          >
            Growth system replacing guesswork
          </motion.div>
          
          <div className="space-y-4">
            {solutionPoints.map((point, index) => (
              <motion.div
                key={point}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15 }}
                className="group relative flex items-start gap-4"
              >
                <div className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full border border-[#ff6a00]/30 bg-[#ff6a00]/10 text-[#ff6a00]">
                  <CheckCircle2 className="size-3.5" />
                </div>
                <p className="text-base leading-relaxed text-white/70 group-hover:text-white/90 transition-colors">{point}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* System Visualization - Now Center/Right */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative flex min-h-[580px] flex-1 items-center justify-center overflow-hidden rounded-3xl border border-[#ff6a00]/20 bg-linear-to-br from-[#ff6a00]/10 to-transparent p-8"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,106,0,0.08),transparent_60%)]" />

          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
            className="absolute h-[310px] w-[310px] rounded-full border border-dashed border-[#ff6a00]/16 sm:h-[350px] sm:w-[350px]"
          >
            {[0, 90, 180, 270].map((angle) => (
              <div
                key={angle}
                className="absolute left-1/2 top-1/2 size-2 rounded-full bg-[#ff6a00] shadow-[0_0_18px_rgba(255,106,0,0.8)]"
                style={{ transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-155px)` }}
              />
            ))}
          </motion.div>

          <div className="relative z-10 flex size-[280px] items-center justify-center sm:size-[320px]">
            <motion.div
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              className="absolute size-36 rounded-full border border-white/8 bg-black/30 shadow-[0_0_70px_rgba(255,106,0,0.12)] sm:size-44"
            />

            <motion.div
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
              className="relative z-20 flex size-28 items-center justify-center rounded-full border border-[#ff6a00]/30 bg-[#111] shadow-[0_0_50px_rgba(255,106,0,0.28)]"
            >
              <div className="flex flex-col items-center text-center">
                <Sparkles className="size-10 text-[#ff6a00]" />
                <div className="mt-2 text-xs uppercase tracking-[0.22em] text-white/45">AI engine</div>
              </div>
            </motion.div>

            {[
              {
                title: "Posting",
                subtitle: "LinkedIn · Instagram · Reddit",
                icon: MessageSquare,
                className: "-translate-y-[190px]",
                accent: "text-[#ffb17a]",
              },
              {
                title: "Insights",
                subtitle: "CTR · comments · saves",
                icon: BarChart3,
                className: "translate-x-[200px] translate-y-[60px]",
                accent: "text-[#7cb5ff]",
              },
              {
                title: "Experimentation",
                subtitle: "New hooks · formats · angles",
                icon: RefreshCcw,
                className: "-translate-x-[200px] translate-y-[60px]",
                accent: "text-emerald-300",
              },
            ].map((node, index) => {
              const Icon = node.icon;

              return (
                <motion.div
                  key={node.title}
                  animate={{
                    y: [0, index === 1 ? -5 : 5, 0],
                    opacity: [0.88, 1, 0.88],
                  }}
                  transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut", delay: index * 0.22 }}
                  className={`absolute z-20 w-[220px] rounded-3xl border border-white/10 bg-[#151515]/92 p-4 shadow-[0_18px_42px_rgba(0,0,0,0.22)] backdrop-blur-sm ${node.className}`}
                >
                  <div className="flex items-center gap-4 text-left">
                    <div className={`flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/5 ${node.accent}`}>
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">{node.title}</div>
                      <div className="mt-0.5 text-sm leading-tight text-white/85">{node.subtitle}</div>
                    </div>
                  </div>
                </motion.div>
              );
            })}

            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 rounded-full border border-[#ff6a00]/10"
            >
              <div className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-[#ff6a00] shadow-[0_0_16px_rgba(255,106,0,0.85)]" />
            </motion.div>
          </div>

        </motion.div>
      </div>
    </LandingSection>
  );
}
