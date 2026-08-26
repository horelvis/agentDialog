import type { Messages } from "./types";

export const ca: Messages = {
  hasAQuestionForYou: "té una pregunta per a tu",
  about: "SOBRE",
  whatChanged: "QUÈ HA CANVIAT",
  moreChanges: (count) => `+${count} més — la llista completa és a l'aplicació.`,
  context: "CONTEXT",
  contextTruncated: "... (el context complet és a l'aplicació)",
  typeLabel: "Tipus",
  questionLabel: "Pregunta",
  answerThisQuestion: "Respondre aquesta pregunta",
  replyWillNotReach: (agentName) => `Respondre aquest correu no arriba a ${agentName}.`,
  expires: (formattedDate) => `Caduca: ${formattedDate}`,
  noPasswordNote: "T'enviarem un codi d'accés per correu — no hi ha cap contrasenya per recordar.",
  queryType: {
    validation: "Validació",
    interpretation: "Interpretació",
    expert_query: "Consulta experta",
    labeling: "Etiquetatge",
  },
  codeSubject: "El teu codi d'accés",
  codeHeading: "El teu codi d'accés",
  codeIntro: (agentName) => `${agentName} espera la teva resposta. Fes servir aquest codi per entrar.`,
  codeExpiresIn: (minutes) => `Aquest codi caduca en ${minutes} minuts.`,
  codeIgnore: "Si no has demanat aquest codi, ignora aquest correu.",
  invitationSubject: (agentName) => `${agentName} t'ha convidat a una conversa`,
  invitationIntro: (agentName, conversationTitle) =>
    conversationTitle
      ? `L'agent ${agentName} t'ha convidat a una conversa: ${conversationTitle}.`
      : `L'agent ${agentName} t'ha convidat a una conversa.`,
  invitationAccept: "Acceptar la invitació",
  invitationIgnore: "Si no vols unir-t'hi, ignora aquest correu.",
};
