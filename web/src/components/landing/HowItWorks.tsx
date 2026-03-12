const steps = [
  {
    step: "1",
    title: "Agent asks a question",
    description: "One MCP tool call. Your agent sends a question to any human by email. No dashboards, no config files — just human_query() and you're done.",
  },
  {
    step: "2",
    title: "Human replies from their inbox",
    description: "The human receives an email with the full question and context. They hit reply, type their answer, and send. That's it — no app, no login, no verification code.",
  },
  {
    step: "3",
    title: "Agent gets the answer",
    description: "The reply is parsed, cleaned, and delivered back to the agent automatically via webhook or MCP poll. End-to-end, one email reply is all it takes.",
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
            Your agent drives the entire flow. Humans just show up when needed.
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
      </div>
    </section>
  );
}
