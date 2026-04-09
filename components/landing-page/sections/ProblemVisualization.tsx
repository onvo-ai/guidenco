"use client";

import { motion } from "framer-motion";
import { Target } from "lucide-react";

export function ProblemVisualization() {
  return (
    <div className="relative flex min-h-[450px] flex-col overflow-hidden rounded-3xl border border-red-500/20 bg-[#111] p-0 shadow-[0_0_50px_rgba(239,68,68,0.1)]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(239,68,68,0.08),transparent_70%)]" />

      <div className="relative z-10 flex flex-1 flex-col p-6 sm:p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="size-2 animate-pulse rounded-full bg-red-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-red-400">Warning</span>
            </div>
            <h3 className="mt-2 text-xl font-semibold text-white">Scattered Acquisition</h3>
          </div>
          <div className="flex -space-x-2">
            {["#0A66C2", "#E4405F", "#FF0000"].map((color) => (
              <div
                key={color}
                className="flex size-8 items-center justify-center rounded-full border-2 border-[#111] bg-white/5"
                style={{ color }}
              >
                <div className="size-3 rounded-full" style={{ backgroundColor: color }} />
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex-1">
          <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="problem-grid" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.03)" />
              </linearGradient>
              <linearGradient id="problem-cac" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="rgba(239,68,68,0.15)" />
                <stop offset="100%" stopColor="rgba(239,68,68,0.95)" />
              </linearGradient>
              <linearGradient id="problem-conversion" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="rgba(245,158,11,0.15)" />
                <stop offset="100%" stopColor="rgba(245,158,11,0.95)" />
              </linearGradient>
              <linearGradient id="problem-traffic" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="rgba(56,189,248,0.15)" />
                <stop offset="100%" stopColor="rgba(56,189,248,0.95)" />
              </linearGradient>
              <linearGradient id="problem-traffic-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(56,189,248,0.22)" />
                <stop offset="100%" stopColor="rgba(56,189,248,0.02)" />
              </linearGradient>
            </defs>

            <rect width="100" height="100" fill="url(#problem-grid)" opacity="0.08" />
            <g opacity="0.22">
              {[14, 32, 50, 68, 86].map((y) => (
                <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="white" strokeDasharray="2.5 3.5" strokeWidth="0.45" />
              ))}
              {[16, 36, 56, 76, 96].map((x) => (
                <line key={x} x1={x} x2={x} y1="0" y2="100" stroke="white" strokeDasharray="2.5 3.5" strokeWidth="0.35" />
              ))}
            </g>

            <motion.path
              d="M0,76 C10,74 18,66 28,56 C38,46 48,38 58,40 C70,42 82,34 92,24 C96,20 98,18 100,16"
              fill="none"
              stroke="url(#problem-cac)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.4"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.7, ease: "easeOut" }}
            />
            <motion.path
              d="M0,56 C12,52 20,58 30,50 C42,40 52,48 64,42 C76,36 86,38 100,30"
              fill="none"
              stroke="url(#problem-conversion)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.4"
              strokeDasharray="1 0"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.9, ease: "easeOut", delay: 0.12 }}
            />
            <motion.path
              d="M0,84 C12,82 22,78 34,66 C46,54 58,60 70,46 C80,34 90,30 100,22 L100,100 L0,100 Z"
              fill="url(#problem-traffic-fill)"
              stroke="none"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.4, ease: "easeOut", delay: 0.08 }}
            />
            <motion.path
              d="M0,84 C12,82 22,78 34,66 C46,54 58,60 70,46 C80,34 90,30 100,22"
              fill="none"
              stroke="url(#problem-traffic)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.6"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 2.1, ease: "easeOut", delay: 0.08 }}
            />

            {[
              { cx: 28, cy: 56, fill: "#ef4444" },
              { cx: 58, cy: 40, fill: "#ef4444" },
              { cx: 92, cy: 24, fill: "#ef4444" },
              { cx: 30, cy: 50, fill: "#f59e0b" },
              { cx: 64, cy: 42, fill: "#f59e0b" },
              { cx: 100, cy: 30, fill: "#f59e0b" },
              { cx: 34, cy: 66, fill: "#38bdf8" },
              { cx: 70, cy: 46, fill: "#38bdf8" },
              { cx: 100, cy: 22, fill: "#38bdf8" },
            ].map((point, index) => (
              <motion.circle
                key={`${point.cx}-${point.cy}-${point.fill}`}
                cx={point.cx}
                cy={point.cy}
                r="1.15"
                fill={point.fill}
                stroke="rgba(17,17,17,0.9)"
                strokeWidth="0.9"
                initial={{ scale: 0, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: 0.35 + index * 0.05 }}
              />
            ))}
          </svg>

          <div className="absolute inset-0 flex flex-col justify-center gap-4 py-8">
            {[
              {
                label: "CAC",
                value: "$480",
                trend: "+12%",
                color: "text-red-400",
                bg: "bg-red-500/10",
                border: "border-red-500/20",
                width: "w-3/4",
                x: "translate-x-4",
              },
              {
                label: "Conversion",
                value: "0.8%",
                trend: "-2.4%",
                color: "text-red-400",
                bg: "bg-red-500/10",
                border: "border-red-500/20",
                width: "w-2/3",
                x: "translate-x-12",
              },
              {
                label: "Traffic",
                value: "12k",
                trend: "Flat",
                color: "text-white/50",
                bg: "bg-white/5",
                border: "border-white/10",
                width: "w-4/5",
                x: "-translate-x-2",
              },
            ].map((metric, index) => (
              <motion.div
                key={metric.label}
                animate={{ y: [-2, 2, -2], x: index % 2 === 0 ? [-1, 1, -1] : [1, -1, 1] }}
                transition={{ duration: 3 + index, repeat: Infinity, ease: "easeInOut" }}
                className={`flex items-center justify-between rounded-xl border ${metric.border} ${metric.bg} p-3 backdrop-blur-md ${metric.width} ${metric.x}`}
              >
                <div>
                  <div className="text-[10px] uppercase text-white/50">{metric.label}</div>
                  <div className="text-lg font-bold text-white">{metric.value}</div>
                </div>
                <div className={`text-xs font-semibold ${metric.color}`}>{metric.trend}</div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 py-2 text-xs font-medium text-red-300">
          <Target className="mr-2 size-3" />
          Audience mismatch detected across 3 channels
        </div>
      </div>
    </div>
  );
}
