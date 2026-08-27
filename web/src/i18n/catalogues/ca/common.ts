export default {
  language: {
    label: "Idioma",
  },
  action: {
    retry: "Torna-ho a provar",
    cancel: "Cancel·la",
    copy: "Copia",
    copied: "Copiat",
  },
  state: {
    loading: "Carregant…",
  },
  error: {
    unreachable: "No s'ha pogut contactar amb el servidor. Torna-ho a provar.",
    unexpected: "Alguna cosa ha fallat. Torna-ho a provar.",
  },
  footer: {
    tagline: "Plataforma de missatgeria pensada per a agents. Feta per a l'era de la IA.",
    github: "GitHub",
    docs: "Docs",
  },
  auth: {
    title: "Inicia sessió a AgentDialog",
    subtitle: "Escriu el teu correu i t'enviarem un codi de verificació.",
    emailLabel: "Adreça electrònica",
    emailPlaceholder: "elteucorreu@exemple.com",
    sendCode: "Envia el codi de verificació",
    checkEmail: "Revisa el teu correu",
    codeSentTo: "T'hem enviat un codi de 6 dígits a <email>{{email}}</email>",
    useAnotherEmail: "Utilitza un altre correu",
    resendCode: "Torna a enviar el codi",
    resendCodeIn: "Torna a enviar el codi en {{seconds}}s",
    sendFailed: "No s'ha pogut enviar el codi de verificació. Torna-ho a provar.",
    invalidCode: "Codi incorrecte o caducat. Torna-ho a provar.",
  },
} as const;
