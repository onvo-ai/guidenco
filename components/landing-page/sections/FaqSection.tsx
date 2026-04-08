import { ChevronDown } from "lucide-react";

import { LandingSection, SurfaceCard } from "../primitives";

const faqs = [
  {
    question: "What does Guidenco actually do?",
    answer:
      "It helps you understand your product, generate growth content, distribute it across channels, and learn from the results in one workflow.",
  },
  {
    question: "Is this only for startups?",
    answer:
      "No. It is useful for founders, growth teams, agencies, and operators who need a repeatable way to improve acquisition.",
  },
  {
    question: "Can I measure the impact?",
    answer:
      "Yes. The platform is designed to track channel traction, engagement, and downstream growth signals so you can make better decisions.",
  },
  {
    question: "Do I need a large team to use it?",
    answer:
      "No. It is designed to reduce the manual work needed to keep a content and experimentation loop running.",
  },
  {
    question: "How do I get started?",
    answer:
      "Book a demo and share your current growth goals. We will walk through the workflow and show where it can create leverage for your team.",
  },
];

export function FaqSection() {
  return (
    <LandingSection
      id="faq"
      badge="FAQ"
      title="Common questions, answered clearly"
      description="A few quick answers for teams evaluating whether Guidenco fits their growth process."
    >
      <div className="grid gap-4">
        {faqs.map((faq) => (
          <SurfaceCard key={faq.question} className="p-0">
            <details className="group p-6">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-left">
                <span className="text-lg font-semibold text-white">{faq.question}</span>
                <ChevronDown className="size-5 shrink-0 text-white/40 transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-4 max-w-4xl text-sm leading-7 text-white/60">{faq.answer}</p>
            </details>
          </SurfaceCard>
        ))}
      </div>
    </LandingSection>
  );
}
