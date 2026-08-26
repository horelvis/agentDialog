export const SUPPORTED_LANGUAGES = ["en", "es", "ca"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Every string the product puts around an agent's words. What the agent wrote —
 * the question, the subject, the options, the context — is never in here.
 */
export interface Messages {
  // Query notification
  hasAQuestionForYou: string;
  about: string;
  whatChanged: string;
  moreChanges: (count: number) => string;
  context: string;
  contextTruncated: string;
  typeLabel: string;
  questionLabel: string;
  answerThisQuestion: string;
  replyWillNotReach: (agentName: string) => string;
  expires: (formattedDate: string) => string;
  noPasswordNote: string;
  queryType: Record<"validation" | "interpretation" | "expert_query" | "labeling", string>;

  // Sign-in code
  codeSubject: string;
  codeHeading: string;
  codeIntro: (agentName: string) => string;
  codeExpiresIn: (minutes: number) => string;
  codeIgnore: string;

  // Invitation
  invitationSubject: (agentName: string) => string;
  invitationIntro: (agentName: string, conversationTitle?: string) => string;
  invitationAccept: string;
  invitationIgnore: string;
}
