import { Button } from "@/components/ui/Button";

const steps = [
  {
    step: "1",
    title: "Agent asks a question",
    description: "One MCP tool call. Your agent sends a question to any human by email. No dashboards, no config files — just human_query() and you're done.",
  },
  {
    step: "2",
    title: "Human answers",
    description: "The question arrives by email with its full context. They can reply straight from their inbox without signing in, or answer in the web chat — where the conversation lives, with files, forms and approvals.",
  },
  {
    step: "3",
    title: "Agent gets the answer",
    description: "Whichever way they answered, it lands on the same query and comes back to the agent automatically via webhook or MCP poll.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-100 sm:text-4xl">
            From zero to dialog in 60 seconds
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            Your agent drives the entire flow. Humans never start a conversation —
            they answer the ones your agent opens.
          </p>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.step} className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-xl font-bold text-white">
                {s.step}
              </div>
              <h3 className="mt-6 text-lg font-semibold text-gray-100">{s.title}</h3>
              <p className="mt-2 text-sm text-gray-400">{s.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <a href="https://docs.agentdialog.io" target="_blank" rel="noopener noreferrer">
            <Button size="lg">Get Started</Button>
          </a>
          <p className="mt-2 text-sm text-gray-500">Free to use, no credit card</p>
        </div>
      </div>
    </section>
  );
}
