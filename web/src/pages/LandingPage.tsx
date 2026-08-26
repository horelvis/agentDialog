import { useEffect } from "react";
import { Hero } from "@/components/landing/Hero";
import { FlowDemo } from "@/components/landing/FlowDemo";
import { Features } from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { CodeExamples } from "@/components/landing/CodeExamples";
import { IntegrationGuide } from "@/components/landing/IntegrationGuide";
import { CTA } from "@/components/landing/CTA";

export function LandingPage() {
  // A reload used to drop the visitor wherever they had scrolled to, which on a
  // long dark page means opening halfway down a section instead of at the top.
  // Restoration is disabled only while the landing is mounted, and only when the
  // URL asks for no particular place: a #features link still works.
  useEffect(() => {
    if (typeof window === "undefined" || !window.history) return;

    const previous = window.history.scrollRestoration;
    if (previous === undefined) return;

    window.history.scrollRestoration = "manual";

    // Two moments, because they cover different reloads. Setting the flag only
    // takes hold from the next navigation on — this load was already committed
    // to restoring — and the browser restores the offset after load, later than
    // this effect runs. So the top is claimed now and again at load.
    const toTop = () => {
      if (!window.location.hash) window.scrollTo(0, 0);
    };

    toTop();
    window.addEventListener("load", toTop);

    return () => {
      window.removeEventListener("load", toTop);
      window.history.scrollRestoration = previous;
    };
  }, []);

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
