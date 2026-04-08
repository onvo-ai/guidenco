"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Linkedin, Instagram, Youtube, Globe, MessageSquare } from "lucide-react";
import { LandingSection } from "../primitives";

const platforms = [
  { name: "LinkedIn", icon: Linkedin, color: "#0A66C2" },
  { name: "Instagram", icon: Instagram, color: "#E4405F" },
  { name: "YouTube", icon: Youtube, color: "#FF0000" },
  { name: "Reddit", icon: Globe, color: "#FF4500" },
  { name: "Blogs", icon: MessageSquare, color: "#FF6A00" },
];

export function ChannelsSection() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <LandingSection
      badge="Channels"
      title="Every Channel. One Brain."
      description="Guidenco experiments across all major platforms so you don't have to."
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.25 }}
        className="relative mx-auto max-w-4xl"
      >
        {/* Orbital container */}
        <div className="relative mx-auto h-[400px] sm:h-[500px] w-full max-w-[500px]">
          {/* Center brain */}
          <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
            <motion.div
              animate={prefersReducedMotion ? undefined : { scale: [1, 1.08, 1], boxShadow: ["0 0 20px rgba(255,106,0,0.2)", "0 0 40px rgba(255,106,0,0.38)", "0 0 20px rgba(255,106,0,0.2)"] }}
              transition={prefersReducedMotion ? undefined : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              className="flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-full border border-[#ff6a00]/30 bg-[#111]"
            >
              <span className="text-3xl sm:text-4xl">🧠</span>
            </motion.div>
          </div>

          {/* Orbital paths */}
          <svg className="absolute inset-0 h-full w-full">
            <ellipse
              cx="50%"
              cy="50%"
              rx="40%"
              ry="40%"
              fill="none"
              stroke="rgba(255,106,0,0.15)"
              strokeWidth="1.5"
              strokeDasharray="6,6"
              className="hidden sm:block"
            />
            <ellipse
              cx="50%"
              cy="50%"
              rx="45%"
              ry="45%"
              fill="none"
              stroke="rgba(255,106,0,0.15)"
              strokeWidth="1.5"
              strokeDasharray="6,6"
              className="sm:hidden"
            />
          </svg>

          {/* Orbiting platforms */}
          {platforms.map((platform, index) => {
            const Icon = platform.icon;
            const angle = (index / platforms.length) * 360;
            const distance = prefersReducedMotion ? 140 : 160;
            return (
              <motion.div
                key={platform.name}
                className="absolute left-1/2 top-1/2"
                animate={
                  prefersReducedMotion
                    ? { x: Math.cos((angle * Math.PI) / 180) * distance, y: Math.sin((angle * Math.PI) / 180) * distance }
                    : {
                        x: [Math.cos((angle * Math.PI) / 180) * distance, Math.cos(((angle + 360) * Math.PI) / 180) * distance],
                        y: [Math.sin((angle * Math.PI) / 180) * distance, Math.sin(((angle + 360) * Math.PI) / 180) * distance],
                      }
                }
                transition={
                  prefersReducedMotion
                    ? { duration: 0.5, delay: index * 0.05 }
                    : { duration: 36, repeat: Infinity, ease: "linear" }
                }
                style={{
                  marginLeft: -28,
                  marginTop: -28,
                }}
              >
                <motion.div
                  animate={
                    prefersReducedMotion
                      ? undefined
                      : {
                          y: [0, -6, 0],
                          rotate: [-1.5, 1.5, -1.5],
                        }
                  }
                  transition={
                    prefersReducedMotion
                      ? undefined
                      : {
                          duration: 3.6 + index * 0.2,
                          repeat: Infinity,
                          ease: "easeInOut",
                          delay: index * 0.12,
                        }
                  }
                  className="relative flex flex-col items-center"
                >
                  <motion.div
                    whileHover={{ scale: 1.12, y: -2 }}
                    className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-[#1a1a1a] shadow-[0_8px_30px_rgba(0,0,0,0.5)] transition-colors hover:border-[#ff6a00]/30"
                  >
                    <Icon className="size-6" style={{ color: platform.color }} />
                  </motion.div>
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-medium text-white/50">
                    {platform.name}
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
        </div>

        {/* Description */}
        <div className="mx-auto mt-4 max-w-2xl text-center rounded-2xl border border-white/5 bg-white/[0.02] p-6 backdrop-blur-sm sm:mt-0">
          <p className="text-base leading-8 text-white/60">
            One intelligence layer across your growth surface area. Plan once, generate once, distribute broadly, and learn from unified channel performance.
          </p>
        </div>
      </motion.div>
    </LandingSection>
  );
}
