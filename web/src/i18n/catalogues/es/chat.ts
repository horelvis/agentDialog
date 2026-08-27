export default {
  shared: {
    untitledConversation: "Sin título",
    newConversation: "Conversación",
    you: "Tú",
    agent: "Agente",
    user: "Usuario",
  },
  list: {
    sectionTitle: "Conversaciones",
    empty: "Todavía no hay conversaciones",
  },
  header: {
    participants_one: "{{count}} participante",
    participants_other: "{{count}} participantes",
    status: {
      active: "activa",
      archived: "archivada",
      closed: "cerrada",
    },
  },
  input: {
    placeholder: "Escribe un mensaje...",
  },
  empty: {
    title: "Selecciona una conversación",
    body: "Elige una conversación en la barra lateral, o acepta una invitación para empezar.",
  },
  typing: {
    one: "El agente está escribiendo...",
    many: "Varios están escribiendo...",
  },
  messages: {
    approval: {
      title: "Aprobación requerida",
      action: "Acción: {{action}}",
      approve: "Aprobar",
      deny: "Denegar",
      approved: "Aprobado",
      denied: "Denegado",
    },
    toolCall: {
      input: "Entrada",
      status: {
        pending: "pendiente",
        running: "en curso",
        completed: "completado",
        failed: "fallido",
      },
    },
    toolResult: {
      output: "Salida",
      result: "Resultado",
    },
    form: {
      submitted: "Enviado",
      submit: "Enviar",
      select: "Selecciona…",
    },
    formResponse: {
      title: "Respuesta del formulario",
    },
    humanQuery: {
      question: "Pregunta",
    },
    humanQueryResponse: {
      confidence: "Confianza: {{percent}}%",
      yes: "Sí",
      no: "No",
    },
    file: {
      unavailable: "Archivo no disponible",
      downloading: "Descargando…",
    },
    voiceNote: {
      unavailable: "Nota de voz no disponible",
      error: "Error",
    },
    notification: {
      fallbackTitle: "Notificación",
    },
  },
  queries: {
    title: "Queries",
    body: "Preguntas de los agentes. Abre una para responderla en su conversación.",
    emptyTitle: "No hay queries pendientes.",
    emptyBody: "Cuando los agentes te envíen preguntas, aparecerán aquí.",
    waitingOnAgent: "Esperando a que el agente aclare",
    answerCta: "Responder →",
  },
  invitations: {
    title: "Invitaciones",
    body: "Acepta o rechaza invitaciones a conversaciones enviadas por agentes.",
    emptyTitle: "No hay invitaciones pendientes",
    emptyBody: "Cuando un agente te invite a una conversación, aparecerá aquí.",
    untitled: "Invitación a conversación",
    from: "de <name>{{name}}</name>",
    accept: "Aceptar",
    decline: "Rechazar",
    status: {
      pending: "pendiente",
      accepted: "aceptada",
      declined: "rechazada",
      expired: "caducada",
      revoked: "revocada",
    },
  },
  settings: {
    title: "Ajustes",
    body: "Gestiona los ajustes de tu cuenta.",
    emailLabel: "Correo electrónico",
    displayNameLabel: "Nombre visible",
    displayNamePlaceholder: "Cómo te ven los demás",
    saveChanges: "Guardar cambios",
    saved: "¡Guardado!",
    sessionTitle: "Sesión",
    sessionBody: "Gestiona tu sesión actual.",
    signOut: "Cerrar sesión",
  },
  agents: {
    title: "Agentes de confianza",
    body: "Agentes cuyas invitaciones has aceptado antes. Las próximas invitaciones de agentes de confianza se aceptan automáticamente.",
    emptyTitle: "Todavía no hay agentes de confianza.",
    emptyBody: "En cuanto aceptes una invitación de un agente, aparecerá aquí.",
    revoke: "Revocar",
  },
} as const;
