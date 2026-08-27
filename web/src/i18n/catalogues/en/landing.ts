export default {
  nav: {
    features: "Features",
    how: "How it Works",
    code: "Code",
    // The docs site is branded "Docs" in every language, like GitHub.
    docs: "Docs",
    github: "GitHub",
    toggleMenu: "Toggle menu",
    dashboard: "Dashboard",
    login: "Login",
  },
  hero: {
    badge: "The agent-first messaging platform",
    // <accent> is the brand-coloured span. Translators move it with the words:
    // in Spanish the emphasis lands on a different part of the sentence.
    headline: "Your agents ask. <accent>Your team answers</accent> in one click.",
    subhead:
      "When your AI agent needs a human decision, it sends one API call. Your team gets an email, signs in with the code it carries, and answers in the chat. No account to create. No password. No context lost.",
    docsLink: "Or read the docs first",
    reassurance: {
      noCard: {
        title: "No credit card",
        detail: "The form asks for one thing: your agent's name.",
      },
      noAccount: {
        title: "No account to create",
        detail: "Your team answers in the chat the email points to.",
      },
      fast: {
        title: "Key in 15 seconds",
        detail: "Shown once, on this page. Copy it and you're integrating.",
      },
    },
  },
  flow: {
    heading: "See the full loop in action",
    intro:
      "A graph runs until it reaches a decision that is not the agent's to make. It stops there, a person answers with the consequences spelled out, and the answer comes back structured — so the graph carries on and closes the operation.",
    // The two rails of the stage. Lowercase on purpose: they are labels on a
    // diagram, not headings.
    laneAgent: "agent",
    laneHuman: "human",
    status: {
      ready: "ready",
      waiting: "paused on a human",
      held: "held for review",
      closed: "closed",
      running: "running",
    },
    // What each node did, in the words of whoever did it. The node *names*
    // (__start__, gather_context…) are code and stay in the component.
    node: {
      start: "the agent invokes its graph",
      gatherContext: "reads 4 sources · 8s",
      askHuman: "hands the decision over",
      applyDecision: "writes the answer back · 0.4s",
      end: "the agent closes the operation",
      untaken: "not taken this run",
      escalateHeld: "held for review · nothing written",
    },
    query: {
      risk: "medium risk",
      subject: "Subject · record #A-1042",
      answered: "answered",
      waiting: "waiting {{clock}}",
      question: "Approve this operation?",
      chosen: "chosen",
      choose: "choose",
    },
    options: {
      apply: {
        label: "Option A",
        consequence: "Applied now. The operation closes today.",
      },
      escalate: {
        label: "Option B",
        consequence: "Held for review. Nothing is written yet.",
      },
    },
    footnote:
      "A person took the place of a hardcoded rule. Everything else is the graph you already have.",
    footnoteReduced: "Animation paused: your system asks for reduced motion.",
  },
  features: {
    heading: "The missing layer between your agents and your team",
    intro:
      "Your agents are autonomous — until they're not. When they hit a decision that needs a human, AgentDialog gets the answer without breaking the flow.",
    docsLink: "Read the Docs",
    items: {
      email: {
        title: "Notified by Email, Answers in One Click",
        description:
          "A human gets an email the moment your agent needs them, signs in with a code rather than a password, and answers in the chat where that conversation lives.",
      },
      mcp: {
        title: "Ask Humans from Any MCP Agent",
        description:
          "If your agent speaks MCP — Claude, LangChain, or your own — it can ask a human a question with a single tool call and get a structured answer back.",
      },
      risk: {
        title: "Risk-Aware Approvals",
        description:
          "Agents tag each action with a risk level — low, medium, high, or critical. Humans see the severity at a glance and approve or deny with one click.",
      },
      forms: {
        title: "Interactive Forms",
        description:
          "Agents send structured forms with selects, numbers, and text fields. Humans fill them out directly in the chat — no external links needed.",
      },
      tools: {
        title: "Live Tool Visibility",
        description:
          "Watch your agents work in real-time: which tools they call, the inputs they send, and the results they get. Full transparency, zero guessing.",
      },
      status: {
        title: "Live Status, Zero Polling",
        description:
          "Your agent sees typing indicators, read receipts, and approval status as they happen via WebSocket. No polling loops, no stale state. Webhooks available for async flows.",
      },
    },
  },
  how: {
    heading: "From zero to dialog in 60 seconds",
    intro:
      "Your agent drives the entire flow. Humans never start a conversation — they answer the ones your agent opens.",
    cta: "Get Started",
    ctaNote: "Free to use, no credit card",
    steps: {
      ask: {
        title: "Agent asks a question",
        description:
          "One MCP tool call. Your agent sends a question to any human by email. No dashboards, no config files — just human_query() and you're done.",
      },
      answer: {
        title: "Human answers",
        description:
          "An email tells them a question is waiting. They open it, sign in with a code — no password to remember — and answer in the chat, alongside the files, forms and approvals of that conversation.",
      },
      receive: {
        title: "Agent gets the answer",
        description:
          "The answer comes back to the agent automatically, via webhook or MCP poll. No dashboard to watch.",
      },
    },
  },
  examples: {
    heading: "Three API calls. That's the integration.",
    // <docs> is the link to docs.agentdialog.io.
    intro:
      "Register, create a conversation, send a message. Works from cURL, TypeScript, Python, or anything that speaks HTTP. <docs>Full API docs</docs>",
    // Tab names are the technologies themselves; they read the same in all
    // three languages, and the code under them is never translated.
    tabs: {
      mcp: "MCP (Claude)",
      curl: "cURL",
      typescript: "TypeScript",
      python: "Python",
    },
  },
  guide: {
    badge: "Developer Guide",
    heading: "Everything you need in one doc",
    intro:
      "Read the complete integration guide and have your agent talking to humans in minutes. All your agent needs is an API key.",
    docsLink: "Read the Docs",
    download: "or download as Markdown",
    highlights: {
      quickstart: "5-minute quickstart with cURL, TypeScript, or Python",
      queries:
        "MCP Human Queries: ask a human with one tool call, get a structured answer back",
      messages: "Structured messages: forms, approvals, and notifications",
      email:
        "Email notifications and passwordless sign-in — no account for a human to create",
      realtime: "Real-time WebSocket, Webhooks, and SDKs for TypeScript and Python",
    },
  },
  faq: {
    heading: "Questions worth asking first",
    items: {
      account: {
        question: "Does my team need an account?",
        answer:
          "No. They get an email. A <code>low</code> or <code>medium</code> risk question carries a link that opens that one question and resolves it; <code>high</code> and <code>critical</code> carry a sign-in code instead. There is no password at any point.",
      },
      inboundEmail: {
        question: "What happens if someone replies to the email?",
        answer:
          "Nothing reads it, and that is a decision rather than an oversight. Inbound mail is not ingested: a reply reaches a mailbox with an auto-responder pointing the sender back to the app. Answers happen in the chat, or on the one-click link.",
      },
      delivery: {
        question: "How does my agent learn the answer?",
        answer:
          "Through a webhook, if it has a public URL that listens. An agent running inside an MCP client cannot receive one — it is not a server — so it asks with <code>get_query</code> and the answer is there. A tool that waits instead of asking is on the roadmap for v0.9.",
      },
      admission: {
        question: "Can I ask anything?",
        answer:
          "No, and that is the product. A query is typed, and an admission gate refuses questions a human could not actually decide: a subject with nothing to look at, a risk above <code>low</code> with no consequences spelled out, a repeated decision that never says what changed. The <code>422</code> carries a <code>remedy</code> field naming what to add.",
      },
      linkSafety: {
        question: "Is it safe to send that link by email?",
        answer:
          "The link is a capability for one question. Whoever holds it can answer that question and nothing else — not read the conversation, not see other queries, not reach the account. It is spent when it is used and expires with the question. <code>high</code> and <code>critical</code> mint no link at all.",
      },
      integrations: {
        question: "What does it integrate with?",
        answer:
          "A TypeScript SDK on npm, with adapters for LangChain and the Vercel AI SDK. An MCP server for Claude or any other MCP client. REST for everything else. A Python SDK exists in the repository and is not published yet — it is on the roadmap.",
      },
      riskAuthority: {
        question: "Who decides what counts as high risk?",
        answer:
          "The agent declares it, and it does not get the last word. A question about an amount above a configured threshold is treated as high risk whatever the agent said, and high risk means a sign-in code rather than a one-click link. An agent cannot talk its way into the easier path for a decision that moves real money.",
      },
      keyLeak: {
        question: "What if my API key leaks — can someone act as my agent?",
        answer:
          "Rotate it with <code>POST /agent/key/rotate</code>: the new key is issued and the old one stops working at once. Keys are stored as bcrypt hashes and shown once, so a leak has to come from your side rather than ours. Over MCP the caller is taken from the credentials on every single request and never from the session id — holding somebody else's session is not enough to act as them.",
      },
      webhookSignature: {
        question: "How do I know a delivery really came from you?",
        // <link> is the standardwebhooks.com anchor.
        answer:
          "Every webhook delivery is signed following <link>Standard Webhooks</link>, so you verify it with an off-the-shelf library instead of trusting a snippet of ours. The signed content covers the timestamp, so a captured delivery cannot be replayed later, and a rotation signs with the old key and the new one at once so nothing is dropped while you switch.",
      },
    },
  },
  cta: {
    heading: "Integrate in 60 seconds. Seriously.",
    intro:
      "Three API calls to connect your agent. Your team gets an email, signs in with the code and answers in one click. No account to create, no password to remember.",
    primary: "Get your API key",
    secondary: "Read the Docs",
    note: "No credit card. No account to create.",
  },
  form: {
    label: "Name your agent",
    placeholder: "Name your agent — Release Agent",
    submit: "Get your API key",
    // <slug> is the generated agent slug, which is never translated.
    preview: "Registers as <slug>{{slug}}</slug>",
    quickstart: "Quickstart",
    error: {
      // Only the failures we recognise are worded here. A message the API sends
      // back is shown as it arrives.
      taken: "That name is taken twice over. Try a more specific one.",
      rateLimitedMinutes:
        "Too many keys from this network. Try again in {{minutes}} min, or register from the terminal — see the quickstart.",
      rateLimited:
        "Too many keys from this network. Register from the terminal instead — see the quickstart.",
      failed: "Could not create the key. Try the quickstart instead.",
      unreachable: "Could not reach the API. Check your connection and try again.",
    },
    issued: {
      // <slug> is the agent slug, in a <code> element.
      title: "<slug>{{slug}}</slug> is live. Here is its key.",
      warning: "Shown once. Copy it now — losing it means rotating the key.",
      configLabel: "Paste into your MCP client config:",
      next: "Now ask a human a question →",
    },
  },
  footer: {
    tagline: "Agent-first messaging platform. Built for the AI era.",
    github: "GitHub",
    docs: "Docs",
  },
  notFound: {
    message: "Page not found",
    home: "Go Home",
  },
} as const;
