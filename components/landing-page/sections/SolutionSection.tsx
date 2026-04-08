"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Brain } from "lucide-react";
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
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Solution points */}
        <div className="flex flex-col justify-center gap-4">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mb-2 inline-flex w-fit rounded-full border border-[#ff6a00]/30 bg-[#ff6a00]/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-[#ffb17a]"
          >
            Growth system replacing guesswork
          </motion.div>
          
          {solutionPoints.map((point, index) => (
            <motion.div
              key={point}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.15 }}
              className="flex items-center gap-4 rounded-2xl border border-[#ff6a00]/20 bg-white/[0.03] p-5"
            >
              <div className="flex size-10 items-center justify-center rounded-full bg-[#ff6a00]/10 text-[#ff6a00]">
                <CheckCircle2 className="size-5" />
              </div>
              <p className="text-lg text-white/80">{point}</p>
            </motion.div>
          ))}
        </div>

        {/* Clean System Visualization */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative flex min-h-[400px] items-center justify-center rounded-3xl border border-[#ff6a00]/20 bg-gradient-to-br from-[#ff6a00]/10 to-transparent p-8"
        >
          {/* Central brain with orbiting elements */}
          <div className="relative">
            {/* Outer glow */}
            <motion.div
              animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2] }}
              transition={{ duration: 4, repeat: Infinity }}
              className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff6a00]/20 blur-3xl"
            />
            
            {/* Central brain */}
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="relative flex h-28 w-28 items-center justify-center rounded-full border border-[#ff6a00]/30 bg-[#111] shadow-[0_0_50px_rgba(255,106,0,0.3)]"
            >
              <Brain className="size-12 text-[#ff6a00]" />
            </motion.div>

            {/* Orbiting dots */}
            {[0, 60, 120, 180, 240, 300].map((angle, i) => (
              <motion.div
                key={angle}
                animate={{
                  x: Math.cos((angle * Math.PI) / 180) * 80,
                  y: Math.sin((angle * Math.PI) / 180) * 80,
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: 2,
                  delay: i * 0.3,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                style={{
                  marginLeft: -6,
                  marginTop: -6,
                }}
                className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff6a00]"
              />
            ))}
          </div>

          {/* Labels */}
          <div className="absolute bottom-8 left-8 rounded-xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white/70">
            AI Engine
          </div>
          <div className="absolute bottom-8 right-8 rounded-xl border border-[#ff6a00]/20 bg-[#ff6a00]/10 px-4 py-2 text-sm text-[#ffb17a]">
            Smart Decisions
          </div>
        </motion.div>
      </div>
    </LandingSection>
  );
}
