"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CtaButton, SurfaceCard } from "../primitives";

export function FinalCtaSection() {
  return (
    <section className="px-4 pb-20 pt-4 sm:px-6 lg:px-8 lg:pb-28">
      <div className="mx-auto max-w-7xl">
        <SurfaceCard className="relative overflow-hidden">
          {/* Background glow */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,106,0,0.2),transparent_50%)]" />
          
          <div className="relative z-10 px-8 py-16 text-center sm:px-12 sm:py-20">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
            >
              <div className="mb-4 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-white/50">
                Ready to grow
              </div>
              <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
                Stop Guessing. Start Growing.
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-white/60">
                Let Guidenco find your growth strategy automatically and turn your next campaign into a compounding learning loop.
              </p>
              
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <motion.div
                  animate={{ boxShadow: [
                    "0 0 20px rgba(255,106,0,0.3)",
                    "0 0 40px rgba(255,106,0,0.5)",
                    "0 0 20px rgba(255,106,0,0.3)",
                  ]}}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <CtaButton href="/app">
                    Start Free
                    <ArrowRight className="ml-2 size-4" />
                  </CtaButton>
                </motion.div>
                <CtaButton href="/auth/sign-up" variant="outline">
                  Book Demo
                </CtaButton>
              </div>
            </motion.div>
          </div>
        </SurfaceCard>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/10 px-4 py-8 text-sm text-white/50 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div>© 2026 Guidenco. All rights reserved.</div>
        <div className="flex gap-6">
          <Link href="#features" className="transition-colors hover:text-white">
            Features
          </Link>
          <Link href="#how-it-works" className="transition-colors hover:text-white">
            How it works
          </Link>
          <Link href="/auth/sign-in" className="transition-colors hover:text-white">
            Sign In
          </Link>
        </div>
      </div>
    </footer>
  );
}
