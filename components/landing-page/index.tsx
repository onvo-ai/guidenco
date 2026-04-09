import { LandingNav } from "./sections/LandingNav";
import { HeroSection } from "./sections/HeroSection";
import { SocialProofSection } from "./sections/SocialProofSection";
import { ProblemSection } from "./sections/ProblemSection";
import { BeforeAfterSection } from "./sections/BeforeAfterSection";
import { SolutionSection } from "./sections/SolutionSection";
import { HowItWorksSection } from "./sections/HowItWorksSection";
import { BenefitsSection } from "./sections/BenefitsSection";
import { ChannelsSection } from "./sections/ChannelsSection";
import { FeaturesSection } from "./sections/FeaturesSection";
import { AdvancedFeaturesSection } from "./sections/AdvancedFeaturesSection";
import { ResultsSection } from "./sections/ResultsSection";
import { AudienceSection } from "./sections/AudienceSection";
import { UseCasesSection } from "./sections/UseCasesSection";
import { DashboardSection } from "./sections/DashboardSection";
import { RoiSection } from "./sections/RoiSection";
import { TestimonialsSection } from "./sections/TestimonialsSection";
import { FaqSection } from "./sections/FaqSection";
import { FinalCtaSection, Footer } from "./sections/FooterCTASection";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-[#ff6a00]/30">
      <LandingNav />
      <main>
        <HeroSection />
        <ProblemSection />
        <SocialProofSection />
        
        <BeforeAfterSection />
        <SolutionSection />
        <HowItWorksSection />
        <BenefitsSection />
        <ChannelsSection />
        <FeaturesSection />
        <AdvancedFeaturesSection />
        <ResultsSection />
        <AudienceSection />
        <UseCasesSection />
        <DashboardSection />
        <RoiSection />
        {/* <TestimonialsSection /> */}
        <FaqSection />
        <FinalCtaSection />
      </main>
      <Footer />
    </div>
  );
}
