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
