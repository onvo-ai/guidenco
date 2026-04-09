"use client";

import { motion } from "framer-motion";
import { ArrowRight, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CtaButton } from "../primitives";
import { HeroShowcase } from "./HeroShowcase";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-20 sm:px-6 sm:pb-28 sm:pt-24 lg:px-8">
      {/* Background glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,106,0,0.12),transparent_60%)]" />
      
      <div className="relative mx-auto max-w-7xl">
        {/* Header text */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mx-auto mb-16 max-w-4xl text-center"
        >
          <Badge className="mb-6 border-[#ff6a00]/30 bg-[#ff6a00]/10 px-4 py-1.5 text-sm text-white" variant="outline">
            AI-Powered Growth System
          </Badge>
          <h1 className="mb-6 text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
            Your AI Growth Engine That Finds What Actually Works
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-white/70 sm:text-xl">
            Guidenco understands your product, creates content across multiple channels, tests performance, and continuously optimizes to drive real growth.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <CtaButton href="/book-demo" className="shadow-[0_0_40px_rgba(255,106,0,0.4)]">
              Book Demo
              <ArrowRight className="ml-2 size-4" />
            </CtaButton>
            <CtaButton href="#how-it-works" variant="outline">
              <Play className="mr-2 size-4" />
              See How It Works
            </CtaButton>
          </div>
          <p className="mt-6 text-sm text-white/50">Built for companies of every size to grow faster</p>
        </motion.div>

        {/* Clean Dashboard/Flow Visualization */}
        <HeroShowcase />
      </div>
    </section>
  );
}
