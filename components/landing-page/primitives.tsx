"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SectionProps = {
  id?: string;
  badge?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  align?: "left" | "center";
};

export function LandingSection({
  id,
  badge,
  title,
  description,
  children,
  className,
  align = "center",
}: SectionProps) {
  return (
    <section id={id} className={cn("px-4 py-16 sm:px-6 sm:py-20 lg:px-8", className)}>
      <div className="mx-auto max-w-7xl">
        <div
          className={cn(
            "mb-10 space-y-4 sm:mb-14",
            align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl text-left"
          )}
        >
          {badge ? (
            <Badge
              variant="outline"
              className="border-white/15 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-white/70"
            >
              {badge}
            </Badge>
          ) : null}
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">{title}</h2>
          {description ? <p className="text-base leading-7 text-white/65 sm:text-lg">{description}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

type CtaButtonProps = {
  href: string;
  children: ReactNode;
  variant?: "default" | "outline";
  className?: string;
};

export function CtaButton({ href, children, variant = "default", className }: CtaButtonProps) {
  return (
    <Button
      asChild
      variant={variant}
      size="lg"
      className={cn(
        "h-11 rounded-full px-6 text-sm font-semibold",
        variant === "default"
          ? "bg-[#ff6a00] text-white hover:bg-[#ff7d26]"
          : "border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white",
        className
      )}
    >
      <Link href={href}>{children}</Link>
    </Button>
  );
}

type SurfaceProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

export function SurfaceCard({ children, className, delay = 0 }: SurfaceProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay }}
      className={cn(
        "rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.2)] backdrop-blur-md transition-colors hover:bg-white/10",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
