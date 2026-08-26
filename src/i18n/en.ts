import type { Messages } from "./types";

export const en: Messages = {
  hasAQuestionForYou: "has a question for you",
  about: "ABOUT",
  whatChanged: "WHAT CHANGED",
  moreChanges: (count) => `+${count} more — see the app for the full list.`,
  context: "CONTEXT",
  contextTruncated: "... (see full context in app)",
  typeLabel: "Type",
  questionLabel: "Question",
  answerThisQuestion: "Answer this question",
  replyWillNotReach: (agentName) => `Replying to this email will not reach ${agentName}.`,
  expires: (formattedDate) => `Expires: ${formattedDate}`,
  noPasswordNote: "We'll email you a sign-in code — there is no password to remember.",
  queryType: {
    validation: "Validation",
    interpretation: "Interpretation",
    expert_query: "Expert Query",
    labeling: "Labeling",
  },
  codeSubject: "Your verification code",
  codeHeading: "Your verification code",
  codeIntro: (agentName) => `${agentName} is waiting for your answer. Use this code to sign in.`,
  codeExpiresIn: (minutes) => `This code expires in ${minutes} minutes.`,
  codeIgnore: "If you did not ask for this code, ignore this email.",
  invitationSubject: (agentName) => `${agentName} invited you to a conversation`,
  invitationIntro: (agentName, conversationTitle) =>
    conversationTitle
      ? `Agent ${agentName} has invited you to join a conversation: ${conversationTitle}.`
      : `Agent ${agentName} has invited you to join a conversation.`,
  invitationAccept: "Accept invitation",
  invitationIgnore: "If you do not want to join, simply ignore this email.",
};
