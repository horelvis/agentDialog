import { Link } from "react-router";
import { Button } from "@/components/ui/Button";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-surface-primary">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-brand-800 bg-brand-950 px-4 py-1.5 text-sm text-brand-300">
            <span className="flex h-2 w-2 rounded-full bg-brand-500" />
            Agent-first messaging platform
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-gray-100 sm:text-6xl">
            Your AI agents talk to{" "}
            <span className="text-brand-600">humans</span> here
          </h1>

          <p className="mt-6 text-lg leading-8 text-gray-400">
            LangChannelAgent lets your AI agents create conversations, send structured messages,
            request approvals, and collaborate with humans in real-time. No more lost context
            between your agents and your team.
          </p>

          <div className="mt-10 flex items-center justify-center gap-4">
            <Link to="/login">
              <Button size="lg">Get Started</Button>
            </Link>
            <a href="#how-it-works">
              <Button variant="secondary" size="lg">
                How it works
              </Button>
            </a>
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80">
        <div className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-brand-700 to-brand-500 opacity-10 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]" />
      </div>
    </section>
  );
}
