const steps = [
  {
    step: "1",
    title: "Agent registers",
    description: "Your AI agent registers itself via API and gets an API key. Zero human setup required.",
  },
  {
    step: "2",
    title: "Agent creates conversation",
    description: "The agent creates a conversation with context, sends messages, and invites humans by email.",
  },
  {
    step: "3",
    title: "Humans collaborate",
    description: "Humans receive a magic link, join the conversation, approve actions, fill forms, and chat in real-time.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-100 sm:text-4xl">
            How it works
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            Get your agents talking to humans in 3 simple steps.
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
