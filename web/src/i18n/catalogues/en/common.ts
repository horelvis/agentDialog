export default {
  language: {
    label: "Language",
  },
  action: {
    retry: "Try again",
    cancel: "Cancel",
    copy: "Copy",
    copied: "Copied",
  },
  state: {
    loading: "Loading…",
  },
  error: {
    unreachable: "Could not reach the server. Try again.",
    unexpected: "Something went wrong. Try again.",
  },
  // Lives here, not in `landing`, because Footer also mounts on /q/:token
  // (BareLayout, minimal mode) — the anonymous answer page. `landing` is an
  // 11 KB catalogue of strings that page never shows even one of.
  footer: {
    tagline: "Agent-first messaging platform. Built for the AI era.",
    github: "GitHub",
    docs: "Docs",
  },
  // Lives here, not in `chat`, for the same reason in reverse: LoginPage and
  // LoginForm are the public /login route, reached before signing in, and
  // `chat` is the whole signed-in app's catalogue.
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
