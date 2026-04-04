"use client";

import { motion } from "framer-motion";
import { ArrowRight, BarChart3, MessageSquare, Play, RefreshCcw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CtaButton } from "../primitives";

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
            <CtaButton href="/app" className="shadow-[0_0_40px_rgba(255,106,0,0.4)]">
              Start Growing
              <ArrowRight className="ml-2 size-4" />
            </CtaButton>
            <CtaButton href="#how-it-works" variant="outline">
              <Play className="mr-2 size-4" />
              See How It Works
            </CtaButton>
          </div>
          <p className="mt-6 text-sm text-white/50">Used by startups to find product-market fit faster</p>
        </motion.div>

        {/* Clean Dashboard/Flow Visualization */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="relative mx-auto mt-12 w-full max-w-5xl"
        >
          {/* Main container simulating an app window */}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#111111]/80 shadow-[0_0_80px_rgba(255,106,0,0.15)] backdrop-blur-xl">
            
            {/* Window header */}
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

            {/* Inner Content Area */}
            <div className="grid gap-px bg-white/5 sm:grid-cols-[250px_1fr]">
              {/* Sidebar */}
              <div className="bg-[#0a0a0a] p-6 hidden sm:block">
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
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-3">
                      <span className="text-sm text-white/80">{item.name}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`size-1.5 rounded-full ${item.color} ${item.status === 'Running' ? 'animate-pulse' : ''}`} />
                        <span className="text-[10px] text-white/40">{item.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Main Workflow View */}
              <div className="bg-[#111111] p-6 sm:p-10 relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,106,0,0.05),transparent_80%)]" />
                
                <div className="relative z-10 mx-auto max-w-2xl">
                  {/* AI Generation Step */}
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.5 }}
                    className="mb-8 ml-auto mr-12 max-w-sm rounded-2xl rounded-tr-sm bg-[#ff6a00] p-4 text-white shadow-lg"
                  >
                    <div className="mb-2 text-xs font-medium text-white/80 uppercase tracking-wider">Growth Engine</div>
                    <p className="text-sm">I&apos;ve analyzed your recent product update. Based on current trends, a technical deep-dive thread performs 40% better on LinkedIn for your audience.</p>
                  </motion.div>

                  {/* Flow connection line */}
                  <div className="relative h-12 w-full">
                    <motion.div 
                      className="absolute right-24 top-0 h-full w-px bg-gradient-to-b from-[#ff6a00] to-transparent"
                      initial={{ height: 0 }}
                      whileInView={{ height: "100%" }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.8, delay: 1 }}
                    />
                  </div>

                  {/* Action Step */}
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
      </div>
    </section>
  );
}
