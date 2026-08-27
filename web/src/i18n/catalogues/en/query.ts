export default {
  page: {
    gone: {
      title: "This link no longer works",
      body: "It may have been used already, or the question may have closed. Sign in to the app to see anything still waiting for you.",
    },
    answered: {
      title: "Answer sent",
      body: "Thank you — you can close this page.",
    },
    returned: {
      title: "Sent back for more detail",
      body: "They will get back to you. This link keeps working, so you can return to it.",
    },
    asking: "is asking you a question",
    contextLabel: "Context",
    send: "Send answer",
    cantAnswer: "I can't answer this",
    sendBack: "Send it back",
    sendFailed: "That didn't send. Try again.",
  },
  context: {
    about: "About",
    priorDecision: "You decided about this on {{date}}.",
    selfContained: "Self-contained — nothing else to look at.",
    openLink: "Open referenced link",
    showReferent: "Show referent",
    hideReferent: "Hide referent",
    whatChanged: "What changed",
    material: "material",
  },
  reasons: {
    unknown_subject: "I don't know what this is about",
    missing_delta: "I don't know what changed since last time",
    unclear_consequences: "I can't tell what each option would do",
    referent_unreachable: "I can't see the thing being asked about",
    not_my_decision: "This isn't mine to decide",
  },
  answer: {
    // The catalogue is closed and the server enforces it, so {{kind}} is only
    // ever a shape a newer API added that this build has never heard of.
    unsupportedKind:
      "This question asks for an answer of a kind this app doesn't recognise ({{kind}}). Reload to pick up the latest version; if it persists, the agent needs to ask again in a shape this app supports.",
    fields: {
      corrected: "corrected",
      proposed: "proposed",
      select: "Select…",
    },
    scalar: {
      between: "Between {{min}} and {{max}} {{unit}}",
      atLeast: "At least {{min}} {{unit}}",
      atMost: "At most {{max}} {{unit}}",
    },
    text: {
      placeholder: "Type your answer...",
    },
    insufficient: {
      trigger: "I don't have enough context to answer this",
      heading: "What's missing?",
      notePlaceholder: "Anything else the agent should know? (optional)",
      submit: "Send back to the agent",
      reasons: {
        unknown_subject: {
          label: "I don't know what this is about",
          description: "The subject isn't something I recognize.",
        },
        missing_delta: {
          label: "I don't know what changed",
          description: "This references a prior decision but doesn't say what's different now.",
        },
        unclear_consequences: {
          label: "I don't know what happens if I answer",
          description: "What each option leads to isn't clear to me.",
        },
        referent_unreachable: {
          label: "I can't reach what's being referenced",
          description: "The link, attachment or file isn't accessible to me.",
        },
        not_my_decision: {
          label: "This isn't my decision to make",
          description: "Someone else should be answering this.",
        },
      },
    },
  },
  card: {
    type: {
      validation: "Validation",
      interpretation: "Interpretation",
      expert_query: "Expert",
      labeling: "Labeling",
    },
    risk: {
      low: "low",
      medium: "medium",
      high: "high",
      critical: "critical",
    },
    confidence: "Agent confidence: {{percent}}%",
    expiresIn: "Expires in {{minutes}} min",
    additionalContext: "Additional context",
    commentLabel: "Comment (optional)",
    commentPlaceholder: "Additional notes...",
    yourConfidence: "Your confidence: {{percent}}%",
    respond: "Respond",
  },
} as const;
