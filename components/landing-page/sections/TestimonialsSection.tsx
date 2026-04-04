"use client";

import { motion } from "framer-motion";
import { LandingSection, SurfaceCard } from "../primitives";

const testimonials = [
  {
    quote: "Guidenco helped us stop posting randomly and start learning what messaging actually moved pipeline.",
    author: "Aman Patel",
    role: "Founder, B2B SaaS",
    metric: "+38% qualified demos",
  },
  {
    quote: "We finally had one system for creating, distributing, and reviewing content performance across channels.",
    author: "Sana Qureshi",
    role: "Growth Lead, D2C brand",
    metric: "3x faster iteration",
  },
  {
    quote: "It feels like having a growth operator that never stops testing, learning, and feeding the next move.",
    author: "Neil Dsouza",
    role: "Agency Partner",
    metric: "+27% conversion rate",
  },
];

export function TestimonialsSection() {
  return (
    <LandingSection
      badge="Testimonials"
      title="Loved by Founders"
      description="Teams use Guidenco to move from scattered activity to a tighter, more measurable growth system."
    >
      <div className="grid gap-6 md:grid-cols-3">
        {testimonials.map((testimonial, index) => (
          <motion.div
            key={testimonial.author}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ y: -5 }}
          >
            <SurfaceCard className="h-full">
              <div className="mb-6 text-lg leading-8 text-white/80">
                &ldquo;{testimonial.quote}&rdquo;
              </div>
              <div className="mt-auto border-t border-white/10 pt-6">
                <div className="font-semibold text-white">{testimonial.author}</div>
                <div className="text-sm text-white/50">{testimonial.role}</div>
                <div className="mt-3 inline-block rounded-full border border-[#ff6a00]/30 bg-[#ff6a00]/10 px-3 py-1 text-xs font-medium text-[#ffb17a]">
                  {testimonial.metric}
                </div>
              </div>
            </SurfaceCard>
          </motion.div>
        ))}
      </div>
    </LandingSection>
  );
}
