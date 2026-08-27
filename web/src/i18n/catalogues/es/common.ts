export default {
  language: {
    label: "Idioma",
  },
  action: {
    retry: "Reintentar",
    cancel: "Cancelar",
    copy: "Copiar",
    copied: "Copiado",
  },
  state: {
    loading: "Cargando…",
  },
  error: {
    unreachable: "No se pudo contactar con el servidor. Inténtalo otra vez.",
    unexpected: "Algo ha fallado. Inténtalo otra vez.",
  },
  footer: {
    tagline: "Plataforma de mensajería pensada para agentes. Hecha para la era de la IA.",
    github: "GitHub",
    docs: "Docs",
  },
  auth: {
    title: "Inicia sesión en AgentDialog",
    subtitle: "Escribe tu correo y te enviaremos un código de verificación.",
    emailLabel: "Correo electrónico",
    emailPlaceholder: "tucorreo@ejemplo.com",
    sendCode: "Enviar código de verificación",
    checkEmail: "Revisa tu correo",
    codeSentTo: "Te hemos enviado un código de 6 dígitos a <email>{{email}}</email>",
    useAnotherEmail: "Usar otro correo",
    resendCode: "Reenviar código",
    resendCodeIn: "Reenviar código en {{seconds}}s",
    sendFailed: "No se ha podido enviar el código de verificación. Inténtalo de nuevo.",
    invalidCode: "Código incorrecto o caducado. Inténtalo de nuevo.",
  },
} as const;
