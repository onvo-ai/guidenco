import { AlertCircle, ArrowDownRight, RefreshCcw, Search } from "lucide-react";
import { LandingSection } from "../primitives";
import { ProblemVisualization } from "./ProblemVisualization";

const problemPoints = [
  {
    title: "No clarity on what works",
    description: "Posting everywhere without knowing which channel actually drives pipeline.",
    icon: Search,
  },
  {
    title: "Inconsistent strategy",
    description: "Starting and stopping campaigns because there's no system to sustain them.",
    icon: RefreshCcw,
  },
  {
    title: "Zero feedback loop",
    description: "Treating every post as a one-off instead of learning from the data.",
    icon: AlertCircle,
  },
  {
    title: "Wasted time and budget",
    description: "Burning resources on formats and audiences that don't convert.",
    icon: ArrowDownRight,
  },
];

export function ProblemSection() {
  return (
    <LandingSection
      id="problem"
      badge="The problem"
      title="Most Startups Don't Fail Because of Product"
      description="They fail because they never figure out how to reach the right audience. Growth gets stuck when every channel decision is a guess."
    >
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <ProblemVisualization />

        {/* Problem points */}
        <div className="flex flex-col justify-center gap-4">
          {problemPoints.map((point) => {
            const Icon = point.icon;
            return (
              <div
                key={point.title}
                className="group flex items-start gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-5 transition-all hover:border-red-500/30 hover:bg-white/[0.04]"
              >
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/5 text-white/40 transition-colors group-hover:bg-red-500/10 group-hover:text-red-400">
                  <Icon className="size-5" />
                </div>
                <div>
                  <h4 className="text-base font-semibold text-white group-hover:text-red-100">{point.title}</h4>
                  <p className="mt-1 text-sm text-white/60">{point.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </LandingSection>
  );
}
