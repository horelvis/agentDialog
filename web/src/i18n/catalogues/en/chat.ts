export default {
  // Fallback labels for data the API didn't send — a conversation with no
  // title, a sender with no display name. Shown instead of blank UI, never in
  // place of something an agent or a person actually wrote.
  shared: {
    untitledConversation: "Untitled",
    newConversation: "Conversation",
    you: "You",
    agent: "Agent",
    user: "User",
  },
  list: {
    sectionTitle: "Conversations",
    empty: "No conversations yet",
  },
  header: {
    participants_one: "{{count}} participant",
    participants_other: "{{count}} participants",
    status: {
      active: "active",
      archived: "archived",
      closed: "closed",
    },
  },
  input: {
    placeholder: "Type a message...",
  },
  empty: {
    title: "Select a conversation",
    body: "Choose a conversation from the sidebar, or accept an invitation to get started.",
  },
  typing: {
    one: "Agent is typing...",
    many: "Multiple are typing...",
  },
  // The frame around a message, never its content. A message body, a tool's
  // arguments or output, a form field, a file name and a voice note are all
  // written by an agent or a person and stay exactly as written.
  messages: {
    approval: {
      title: "Approval Required",
      action: "Action: {{action}}",
      approve: "Approve",
      deny: "Deny",
      approved: "Approved",
      denied: "Denied",
    },
    toolCall: {
      input: "Input",
      status: {
        pending: "pending",
        running: "running",
        completed: "completed",
        failed: "failed",
      },
    },
    toolResult: {
      output: "Output",
      result: "Result",
    },
    form: {
      submitted: "Submitted",
      submit: "Submit",
      select: "Select…",
    },
    formResponse: {
      title: "Form Response",
    },
    humanQuery: {
      question: "Question",
    },
    humanQueryResponse: {
      confidence: "Confidence: {{percent}}%",
      // Only for a message saved without content, from before the wording of
      // an answer was kept. What the person actually pressed is otherwise
      // shown verbatim — see the comment on HumanQueryResponseMessage.
      yes: "Yes",
      no: "No",
    },
    file: {
      unavailable: "File not available",
      downloading: "Downloading…",
    },
    voiceNote: {
      unavailable: "Voice note not available",
      error: "Error",
    },
    notification: {
      fallbackTitle: "Notification",
    },
  },
  queries: {
    title: "Queries",
    body: "Questions from agents. Open one to answer it in its conversation.",
    emptyTitle: "No pending queries.",
    emptyBody: "When agents send you questions, they'll appear here.",
    waitingOnAgent: "Waiting on the agent to clarify",
    answerCta: "Answer →",
  },
  invitations: {
    title: "Invitations",
    body: "Accept or decline conversation invitations from agents.",
    emptyTitle: "No pending invitations",
    emptyBody: "When an agent invites you to a conversation, it will appear here.",
    untitled: "Conversation Invitation",
    // A tag, not a bare interpolation, because Catalan needs to reword around
    // it (see ca) rather than concatenate a preposition and a name — the two
    // can't be separate nodes without breaking Catalan's elision (d'Ana, not
    // de Ana). See InvitationCard.tsx's <Trans>.
    from: "from <name>{{name}}</name>",
    accept: "Accept",
    decline: "Decline",
    status: {
      pending: "pending",
      accepted: "accepted",
      declined: "declined",
      expired: "expired",
      revoked: "revoked",
    },
  },
  settings: {
    title: "Settings",
    body: "Manage your account settings.",
    emailLabel: "Email",
    displayNameLabel: "Display Name",
    displayNamePlaceholder: "How others see you",
    saveChanges: "Save changes",
    saved: "Saved!",
    sessionTitle: "Session",
    sessionBody: "Manage your current session.",
    signOut: "Sign out",
  },
  agents: {
    title: "Trusted Agents",
    body: "Agents you've previously accepted invitations from. Future invitations from trusted agents are auto-accepted.",
    emptyTitle: "No trusted agents yet.",
    emptyBody: "Once you accept an invitation from an agent, they'll appear here.",
    revoke: "Revoke",
  },
  auth: {
    title: "Sign in to AgentDialog",
    subtitle: "Enter your email and we'll send you a verification code.",
    emailLabel: "Email address",
    emailPlaceholder: "you@example.com",
    sendCode: "Send Verification Code",
    checkEmail: "Check your email",
    codeSentTo: "We sent a 6-digit code to <email>{{email}}</email>",
    useAnotherEmail: "Use a different email",
    resendCode: "Resend code",
    resendCodeIn: "Resend code in {{seconds}}s",
    sendFailed: "Failed to send verification code. Please try again.",
    invalidCode: "Invalid or expired code. Please try again.",
  },
} as const;
