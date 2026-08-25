import { useEffect } from "react";
import { GetKeyForm } from "@/components/landing/GetKeyForm";
import { browserStorage, rememberAttribution } from "@/lib/attribution";

const REASSURANCES = ["No credit card", "No account to create", "Key in 15 seconds"];

export function Hero() {
  // Remember where this visitor came from, so the agent they register carries
  // its origin. Cheap enough to do on every landing view.
  useEffect(() => {
    rememberAttribution(window.location.search, browserStorage());
  }, []);

  return (
    <section id="get-key" className="relative overflow-hidden bg-surface-primary">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-brand-800 bg-brand-950 px-4 py-1.5 text-sm text-brand-300">
            <span className="flex h-2 w-2 rounded-full bg-brand-500" />
            The agent-first messaging platform
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-gray-100 sm:text-6xl">
            Your agents ask.{" "}
            <span className="text-brand-600">Your team answers</span> in one
            click.
          </h1>

          <p className="mt-6 text-lg leading-8 text-gray-400">
            When your AI agent needs a human decision, it sends one API call.
            Your team gets an email, signs in with the code it carries, and
            answers in the chat. No account to create. No password. No context
            lost.
          </p>

          <div className="mt-10 flex flex-col items-center gap-5">
            <GetKeyForm />

            <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              {REASSURANCES.map((item) => (
                <li key={item} className="flex items-center gap-1.5 text-sm text-gray-400">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-severity-success/15">
                    <svg
                      className="h-2.5 w-2.5 text-severity-success"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M2.5 6.5 5 9l4.5-5" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <a
              href="https://docs.agentdialog.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-400 underline underline-offset-4 hover:text-gray-200"
            >
              Or read the docs first
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
