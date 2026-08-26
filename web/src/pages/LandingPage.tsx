import { Hero } from "@/components/landing/Hero";
import { FlowDemo } from "@/components/landing/FlowDemo";
import { Features } from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { CodeExamples } from "@/components/landing/CodeExamples";
import { IntegrationGuide } from "@/components/landing/IntegrationGuide";
import { CTA } from "@/components/landing/CTA";

export function LandingPage() {
  return (
    <>
      <Hero />
      <FlowDemo />
      <Features />
      <HowItWorks />
      <CodeExamples />
      <IntegrationGuide />
      <CTA />
    </>
  );
}
