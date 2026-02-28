import { Hero } from "@/components/landing/Hero";
import { ChatDemo } from "@/components/landing/ChatDemo";
import { Features } from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { CodeExamples } from "@/components/landing/CodeExamples";
import { CTA } from "@/components/landing/CTA";

export function LandingPage() {
  return (
    <>
      <Hero />
      <ChatDemo />
      <Features />
      <HowItWorks />
      <CodeExamples />
      <CTA />
    </>
  );
}
