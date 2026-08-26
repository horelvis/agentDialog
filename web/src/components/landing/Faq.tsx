/**
 * The questions an integrator actually asks, including the three whose honest
 * answer is "no", and the three about what stops the product being turned
 * against them. Inbound mail is not read, an MCP agent has to ask for the
 * answer, and the Python SDK is not published: saying so here is what makes the
 * other four believable.
 *
 * Built on <details>, not React state — it opens with a keyboard and reads
 * correctly to a screen reader without any of that being reimplemented.
 */

interface QuestionAndAnswer {
  question: string;
  answer: React.ReactNode;
}

const FAQ: QuestionAndAnswer[] = [
  {
    question: "Does my team need an account?",
    answer: (
      <>
        No. They get an email. A <Code>low</Code> or <Code>medium</Code> risk question carries a link
        that opens that one question and resolves it; <Code>high</Code> and <Code>critical</Code>{" "}
        carry a sign-in code instead. There is no password at any point.
      </>
    ),
  },
  {
    question: "What happens if someone replies to the email?",
    answer: (
      <>
        Nothing reads it, and that is a decision rather than an oversight. Inbound mail is not
        ingested: a reply reaches a mailbox with an auto-responder pointing the sender back to the
        app. Answers happen in the chat, or on the one-click link.
      </>
    ),
  },
  {
    question: "How does my agent learn the answer?",
    answer: (
      <>
        Through a webhook, if it has a public URL that listens. An agent running inside an MCP
        client cannot receive one — it is not a server — so it asks with <Code>get_query</Code> and
        the answer is there. A tool that waits instead of asking is on the roadmap for v0.9.
      </>
    ),
  },
  {
    question: "Can I ask anything?",
    answer: (
      <>
        No, and that is the product. A query is typed, and an admission gate refuses questions a
        human could not actually decide: a subject with nothing to look at, a risk above{" "}
        <Code>low</Code> with no consequences spelled out, a repeated decision that never says what
        changed. The <Code>422</Code> carries a <Code>remedy</Code> field naming what to add.
      </>
    ),
  },
  {
    question: "Is it safe to send that link by email?",
    answer: (
      <>
        The link is a capability for one question. Whoever holds it can answer that question and
        nothing else — not read the conversation, not see other queries, not reach the account. It
        is spent when it is used and expires with the question. <Code>high</Code> and{" "}
        <Code>critical</Code> mint no link at all.
      </>
    ),
  },
  {
    question: "What does it integrate with?",
    answer: (
      <>
        A TypeScript SDK on npm, with adapters for LangChain and the Vercel AI SDK. An MCP server
        for Claude or any other MCP client. REST for everything else. A Python SDK exists in the
        repository and is not published yet — it is on the roadmap.
      </>
    ),
  },
  {
    question: "Who decides what counts as high risk?",
    answer: (
      <>
        The agent declares it, and it does not get the last word. A question about an amount above a
        configured threshold is treated as high risk whatever the agent said, and high risk means a
        sign-in code rather than a one-click link. An agent cannot talk its way into the easier path
        for a decision that moves real money.
      </>
    ),
  },
  {
    question: "What if my API key leaks — can someone act as my agent?",
    answer: (
      <>
        Rotate it with <Code>POST /agent/key/rotate</Code>: the new key is issued and the old one
        stops working at once. Keys are stored as bcrypt hashes and shown once, so a leak has to come
        from your side rather than ours. Over MCP the caller is taken from the credentials on every
        single request and never from the session id — holding somebody else&apos;s session is not
        enough to act as them.
      </>
    ),
  },
  {
    question: "How do I know a delivery really came from you?",
    answer: (
      <>
        Every webhook delivery is signed following{" "}
        <a
          href="https://www.standardwebhooks.com"
          target="_blank"
          rel="noreferrer"
          className="text-brand-400 underline underline-offset-2 hover:text-brand-300"
        >
          Standard Webhooks
        </a>
        , so you verify it with an off-the-shelf library instead of trusting a snippet of ours. The
        signed content covers the timestamp, so a captured delivery cannot be replayed later, and a
        rotation signs with the old key and the new one at once so nothing is dropped while you
        switch.
      </>
    ),
  },
];

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-surface-tertiary px-1 py-0.5 font-mono text-[13px] text-brand-300">
      {children}
    </code>
  );
}

export function Faq() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-3xl font-bold tracking-tight text-gray-100 sm:text-4xl">
          Questions worth asking first
        </h2>

        <div className="mt-10 space-y-3">
          {FAQ.map((item) => (
            <details
              key={item.question}
              className="group rounded-xl border border-surface-border bg-surface-secondary open:bg-surface-tertiary"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-base font-medium text-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 [&::-webkit-details-marker]:hidden">
                {item.question}
                <svg
                  className="h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 group-open:rotate-180"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 6l4 4 4-4" />
                </svg>
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-gray-400">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
