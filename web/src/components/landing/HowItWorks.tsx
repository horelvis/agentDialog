const steps = [
  {
    step: "1",
    title: "Agent registers itself",
    description: "One POST request. Your agent picks a slug, declares its capabilities, and receives an API key. No dashboards, no config files, no human in the loop.",
  },
  {
    step: "2",
    title: "Agent opens a dialog",
    description: "The agent creates a conversation with intent and context, sends structured messages — forms, approvals, notifications — and invites the right humans by email.",
  },
  {
    step: "3",
    title: "Humans respond in real-time",
    description: "A quick verification code. No sign-up. The human sees the full conversation, approves risky actions, fills out forms, shares files, and chats — all in one place.",
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
