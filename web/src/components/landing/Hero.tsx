import { useEffect } from "react";
import { GetKeyForm } from "@/components/landing/GetKeyForm";
import { rememberAttribution } from "@/lib/attribution";
import { sessionStore } from "@/lib/storage";

/**
 * Each one is checkable against the product, which is the bar this landing has
 * to clear: the form asks for the agent name and nothing else, a human answers
 * in the chat their email points to — not "without signing in", which is untrue
 * for a high-risk query — and the key is shown exactly once, as GetKeyForm warns.
 */
const REASSURANCES = [
  {
    title: "No credit card",
    detail: "The form asks for one thing: your agent's name.",
    icon: (
      <svg className="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 20.25Z"
        />
        {/* The bar is drawn twice: once thick in the card's own colour to cut a
            gap through the icon underneath, then thin on top. Without the gap
            the two strokes merge and the mark reads as a smudge. */}
        <path
          className="stroke-surface-secondary"
          strokeLinecap="round"
          strokeWidth={4}
          d="m3.4 20.6 17.2-17.2"
        />
        <path strokeLinecap="round" strokeWidth={1.5} d="m3.8 20.2 16.4-16.4" />
      </svg>
    ),
  },
  {
    title: "No account to create",
    detail: "Your team answers in the chat the email points to.",
    icon: (
      <svg className="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.1a7.5 7.5 0 0 1 15 0A17.9 17.9 0 0 1 12 21.75c-2.676 0-5.216-.584-7.5-1.65Z"
        />
        {/* The bar is drawn twice: once thick in the card's own colour to cut a
            gap through the icon underneath, then thin on top. Without the gap
            the two strokes merge and the mark reads as a smudge. */}
        <path
          className="stroke-surface-secondary"
          strokeLinecap="round"
          strokeWidth={4}
          d="m3.4 20.6 17.2-17.2"
        />
        <path strokeLinecap="round" strokeWidth={1.5} d="m3.8 20.2 16.4-16.4" />
      </svg>
    ),
  },
  {
    title: "Key in 15 seconds",
    detail: "Shown once, on this page. Copy it and you're integrating.",
    icon: (
      <svg className="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.03 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z"
        />
      </svg>
    ),
  },
];

export function Hero() {
  // Remember where this visitor came from, so the agent they register carries
  // its origin. Cheap enough to do on every landing view.
  useEffect(() => {
    rememberAttribution(window.location.search, sessionStore());
  }, []);

  return (
    <section id="get-key" className="relative overflow-hidden bg-surface-primary">
      <div className="mx-auto max-w-7xl px-4 pb-12 pt-24 sm:px-6 sm:pb-16 sm:pt-32 lg:px-8">
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

          </div>
        </div>

          <ul className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-3">
          {REASSURANCES.map((item) => (
            <li
              key={item.title}
              className="rounded-xl border border-surface-border bg-surface-secondary p-5 text-left"
            >
              <span className="inline-flex text-brand-400" aria-hidden="true">
                {item.icon}
              </span>
              <p className="mt-3.5 text-base font-semibold text-gray-100">{item.title}</p>
              <p className="mt-1 text-sm leading-snug text-gray-400">{item.detail}</p>
            </li>
          ))}
        </ul>

        <div className="mt-8 text-center">
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

      <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80">
        <div className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-brand-700 to-brand-500 opacity-10 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]" />
      </div>
    </section>
  );
}
