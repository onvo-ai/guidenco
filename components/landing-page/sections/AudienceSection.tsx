import { Building2, Megaphone, Rocket, Users } from "lucide-react";

import { LandingSection, SurfaceCard } from "../primitives";

const audienceSegments = [
  {
    title: "Founders",
    description: "Need a simple system to learn what messaging and channels can unlock traction faster.",
    icon: Rocket,
    badge: "Validate faster",
    outcome: "Clarify what to say and where to test first.",
    accent: "from-[#ff6a00]/20 via-[#ff6a00]/10 to-transparent",
  },
  {
    title: "Growth teams",
    description: "Want a repeatable way to test, publish, and review performance without manual chaos.",
    icon: Users,
    badge: "Ship consistently",
    outcome: "Keep experiments moving with a tighter feedback loop.",
    accent: "from-[#3b82f6]/20 via-[#3b82f6]/10 to-transparent",
  },
  {
    title: "Agencies",
    description: "Need to prove value to clients with consistent output and measurable learning loops.",
    icon: Building2,
    badge: "Show value",
    outcome: "Turn reporting into a stronger client story.",
    accent: "from-[#22c55e]/20 via-[#22c55e]/10 to-transparent",
  },
  {
    title: "Creators",
    description: "Need a simple way to see which posts, formats, and platforms are growing their audience.",
    icon: Megaphone,
    badge: "Grow audience",
    outcome: "Double down on content that drives reach, engagement, and conversions.",
    accent: "from-[#f59e0b]/20 via-[#f59e0b]/10 to-transparent",
  },
];

export function AudienceSection() {
  return (
    <LandingSection
      id="audience"
      badge="Audience"
      title="Designed for teams that need growth to become a system"
      description="If you are tired of guessing what to post, where to publish, and what to measure, this is built for you."
    >
      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:mb-8">
        {[
          "Turn guesswork into a repeatable process",
          "Know which channels are worth doubling down on",
          "Make every campaign easier to explain and improve",
        ].map((value, index) => (
          <div
            key={value}
            className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/65 shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
          >
            <span className="mr-2 text-[#ff6a00]">0{index + 1}</span>
            {value}
          </div>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:gap-7">
        {audienceSegments.map((segment, index) => {
          const Icon = segment.icon;
          return (
            <SurfaceCard
              key={segment.title}
              className={`group relative h-full overflow-hidden border-white/10 bg-linear-to-br ${segment.accent} p-0 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.08]`}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_35%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="absolute right-0 top-0 h-24 w-24 translate-x-1/3 -translate-y-1/3 rounded-full bg-[#ff6a00]/10 blur-3xl transition-transform duration-300 group-hover:scale-125" />

              <div className="relative flex h-full flex-col p-6 sm:p-7">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-[#ff6a00]/20 bg-[#ff6a00]/10 shadow-[0_12px_40px_rgba(255,106,0,0.12)]">
                      <Icon className="size-6 text-[#ff6a00]" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-semibold text-white">{segment.title}</h3>
                      <p className="mt-1 text-sm uppercase tracking-[0.24em] text-white/35">{segment.badge}</p>
                    </div>
                  </div>

                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-white/55">
                    Segment {index + 1}
                  </div>
                </div>

                <p className="text-base leading-7 text-white/65">{segment.description}</p>

                <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-sm">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">What this unlocks</div>
                  <p className="mt-2 text-sm leading-6 text-white/80">{segment.outcome}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {[
                      "Less guesswork",
                      "Clearer priorities",
                      "Faster learning",
                    ].map((chip) => (
                      <span
                        key={`${segment.title}-${chip}`}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-white/55"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </SurfaceCard>
          );
        })}
      </div>
    </LandingSection>
  );
}
