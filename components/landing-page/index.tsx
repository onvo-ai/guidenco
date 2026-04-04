import { LandingNav } from "./sections/LandingNav";
import { HeroSection } from "./sections/HeroSection";
import { ProblemSection } from "./sections/ProblemSection";
import { SolutionSection } from "./sections/SolutionSection";
import { HowItWorksSection } from "./sections/HowItWorksSection";
import { ChannelsSection } from "./sections/ChannelsSection";
import { FeaturesSection } from "./sections/FeaturesSection";
import { AdvancedFeaturesSection } from "./sections/AdvancedFeaturesSection";
import { ResultsSection } from "./sections/ResultsSection";
import { UseCasesSection } from "./sections/UseCasesSection";
import { DashboardSection } from "./sections/DashboardSection";
import { TestimonialsSection } from "./sections/TestimonialsSection";
import { FinalCtaSection, Footer } from "./sections/FooterCTASection";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-[#ff6a00]/30">
      <LandingNav />
      <main>
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <HowItWorksSection />
        <ChannelsSection />
        <FeaturesSection />
        <AdvancedFeaturesSection />
        <ResultsSection />
        <UseCasesSection />
        <DashboardSection />
        <TestimonialsSection />
        <FinalCtaSection />
      </main>
      <Footer />
    </div>
  );
}
