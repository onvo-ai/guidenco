"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Rocket, Building2, ShoppingBag, Briefcase } from "lucide-react";
import { LandingSection, SurfaceCard } from "../primitives";

const useCases = [
  {
    id: "startups",
    title: "Startups",
    icon: Rocket,
    description: "Reach product-market fit faster with a consistent testing loop for messaging and channels.",
    color: "#ff6a00",
  },
  {
    id: "saas",
    title: "SaaS",
    icon: Building2,
    description: "Create educational, product-led content that compounds into qualified pipeline.",
    color: "#0A66C2",
  },
  {
    id: "d2c",
    title: "D2C",
    icon: ShoppingBag,
    description: "Turn product stories, trends, and offers into repeatable growth content systems.",
    color: "#E4405F",
  },
  {
    id: "agencies",
    title: "Agencies",
    icon: Briefcase,
    description: "Manage multi-client experimentation and reporting without creating disconnected workflows.",
    color: "#FF4500",
  },
];

export function UseCasesSection() {
  const [activeCase, setActiveCase] = useState("startups");
  const active = useCases.find((c) => c.id === activeCase)!;
  const ActiveIcon = active.icon;

  return (
    <LandingSection
      badge="Use cases"
      title="Built for Every Growth Stage"
      description="Whether you are validating distribution or scaling repeatable acquisition, the workflow adapts to your stage."
    >
      <div className="grid gap-8 lg:grid-cols-[0.35fr_0.65fr] lg:gap-12">
        {/* Toggle buttons */}
        <div className="flex flex-col gap-4">
          {useCases.map((useCase) => {
            const Icon = useCase.icon;
            const isActive = activeCase === useCase.id;
            return (
              <motion.button
                key={useCase.id}
                onClick={() => setActiveCase(useCase.id)}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition-all sm:p-5 ${
                  isActive
                    ? "border-[#ff6a00]/30 bg-[#ff6a00]/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20"
                }`}
              >
                <div
                  className="flex size-12 shrink-0 items-center justify-center rounded-xl sm:size-14"
                  style={{ backgroundColor: `${useCase.color}20`, color: useCase.color }}
                >
                  <Icon className="size-5 sm:size-6" />
                </div>
                <span className={`text-base font-semibold sm:text-lg ${isActive ? "text-white" : "text-white/70"}`}>
                  {useCase.title}
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* Active case display */}
        <div className="relative flex h-full min-h-[400px] flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCase}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="flex h-full flex-col"
            >
              <SurfaceCard className="flex flex-1 flex-col justify-between p-8 sm:p-12">
                <div>
                  <div
                    className="mb-8 flex size-20 items-center justify-center rounded-3xl"
                    style={{ backgroundColor: `${active.color}15`, color: active.color }}
                  >
                    <ActiveIcon className="size-10" />
                  </div>
                  <h3 className="mb-6 text-3xl font-bold text-white sm:text-4xl">{active.title}</h3>
                  <p className="max-w-xl text-lg leading-8 text-white/70 sm:text-xl">{active.description}</p>
                </div>
                
                <div className="mt-12 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
                    <div className="text-sm font-medium text-white/50">Typical Result</div>
                    <div className="mt-2 text-2xl font-bold text-white">3x faster iteration</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
                    <div className="text-sm font-medium text-white/50">Time Saved</div>
                    <div className="mt-2 text-2xl font-bold text-white">15 hrs/week</div>
                  </div>
                </div>
              </SurfaceCard>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </LandingSection>
  );
}
