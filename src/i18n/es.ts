import type { Messages } from "./types";

export const es: Messages = {
  hasAQuestionForYou: "tiene una pregunta para ti",
  about: "SOBRE",
  whatChanged: "QUÉ HA CAMBIADO",
  moreChanges: (count) => `+${count} más — la lista completa está en la aplicación.`,
  context: "CONTEXTO",
  contextTruncated: "... (el contexto completo está en la aplicación)",
  typeLabel: "Tipo",
  questionLabel: "Pregunta",
  answerThisQuestion: "Responder a esta pregunta",
  replyWillNotReach: (agentName) => `Responder a este correo no llega a ${agentName}.`,
  expires: (formattedDate) => `Caduca: ${formattedDate}`,
  noPasswordNote: "Te enviaremos un código de acceso por correo — no hay contraseña que recordar.",
  queryType: {
    validation: "Validación",
    interpretation: "Interpretación",
    expert_query: "Consulta experta",
    labeling: "Etiquetado",
  },
  codeSubject: "Tu código de acceso",
  codeHeading: "Tu código de acceso",
  codeIntro: (agentName) => `${agentName} espera tu respuesta. Usa este código para entrar.`,
  codeExpiresIn: (minutes) => `Este código caduca en ${minutes} minutos.`,
  codeIgnore: "Si no has pedido este código, ignora este correo.",
  invitationSubject: (agentName) => `${agentName} te ha invitado a una conversación`,
  invitationIntro: (agentName, conversationTitle) =>
    conversationTitle
      ? `El agente ${agentName} te ha invitado a una conversación: ${conversationTitle}.`
      : `El agente ${agentName} te ha invitado a una conversación.`,
  invitationAccept: "Aceptar la invitación",
  invitationIgnore: "Si no quieres unirte, ignora este correo.",
};
