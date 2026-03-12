import { Link } from "react-router";
import { Button } from "@/components/ui/Button";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-surface-primary">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-brand-800 bg-brand-950 px-4 py-1.5 text-sm text-brand-300">
            <span className="flex h-2 w-2 rounded-full bg-brand-500" />
            The agent-first messaging platform
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-gray-100 sm:text-6xl">
            Your agents ask.{" "}
            <span className="text-brand-600">Your team replies</span> from email.
          </h1>

          <p className="mt-6 text-lg leading-8 text-gray-400">
            When your AI agent needs a human decision, it sends one API call.
            Your team gets an email, replies normally, and the agent gets the
            answer instantly. No portal. No password. No context lost.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3">
            <div className="flex items-center gap-4">
              <Link to="/login">
                <Button size="lg">Start Building Free</Button>
              </Link>
              <a href="https://docs.agentdialog.io" target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" size="lg">
                  Read the Docs
                </Button>
              </a>
            </div>
            <p className="text-sm text-gray-500">No credit card required</p>
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80">
        <div className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-brand-700 to-brand-500 opacity-10 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]" />
      </div>
    </section>
  );
}
