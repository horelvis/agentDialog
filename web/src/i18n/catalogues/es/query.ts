export default {
  page: {
    gone: {
      title: "Este enlace ya no funciona",
      body: "Puede que ya se haya usado, o que la pregunta se haya cerrado. Inicia sesión en la app para ver lo que todavía esté esperando tu respuesta.",
    },
    answered: {
      title: "Respuesta enviada",
      body: "Gracias — ya puedes cerrar esta página.",
    },
    returned: {
      title: "Devuelta para pedir más detalle",
      body: "Te responderán. Este enlace sigue funcionando, así que puedes volver a él.",
    },
    asking: "te está haciendo una pregunta",
    contextLabel: "Contexto",
    send: "Enviar respuesta",
    cantAnswer: "No puedo responder a esto",
    sendBack: "Devolverla",
    sendFailed: "No se ha podido enviar. Inténtalo de nuevo.",
  },
  context: {
    about: "Sobre esto",
    priorDecision: "Decidiste sobre esto el {{date}}.",
    selfContained: "Autocontenido — no hay nada más que consultar.",
    openLink: "Abrir el enlace referenciado",
    showReferent: "Mostrar el referente",
    hideReferent: "Ocultar el referente",
    whatChanged: "Qué ha cambiado",
    material: "importante",
  },
  reasons: {
    unknown_subject: "No sé de qué trata esto",
    missing_delta: "No sé qué ha cambiado desde la última vez",
    unclear_consequences: "No sé qué haría cada opción",
    referent_unreachable: "No puedo ver aquello sobre lo que se pregunta",
    not_my_decision: "Esto no es una decisión mía",
  },
  answer: {
    unsupportedKind:
      "Esta pregunta pide una respuesta de un tipo que esta app no reconoce ({{kind}}). Recarga la página para tener la última versión; si sigue pasando, el agente tiene que volver a preguntar en un formato que esta app admita.",
    fields: {
      corrected: "corregido",
      proposed: "propuesto",
      select: "Selecciona…",
    },
    scalar: {
      between: "Entre {{min}} y {{max}} {{unit}}",
      atLeast: "Al menos {{min}} {{unit}}",
      atMost: "Como máximo {{max}} {{unit}}",
    },
    text: {
      placeholder: "Escribe tu respuesta...",
    },
    insufficient: {
      trigger: "No tengo contexto suficiente para responder a esto",
      heading: "¿Qué falta?",
      notePlaceholder: "¿Algo más que el agente deba saber? (opcional)",
      submit: "Devolver al agente",
      reasons: {
        unknown_subject: {
          label: "No sé de qué trata esto",
          description: "No reconozco el asunto.",
        },
        missing_delta: {
          label: "No sé qué ha cambiado",
          description: "Esto hace referencia a una decisión anterior pero no dice qué es distinto ahora.",
        },
        unclear_consequences: {
          label: "No sé qué pasa si respondo",
          description: "No tengo claro a qué lleva cada opción.",
        },
        referent_unreachable: {
          label: "No puedo acceder a lo referenciado",
          description: "El enlace, el archivo adjunto o el fichero no está a mi alcance.",
        },
        not_my_decision: {
          label: "Esto no es una decisión mía",
          description: "Debería responder otra persona.",
        },
      },
    },
  },
  card: {
    type: {
      validation: "Validación",
      interpretation: "Interpretación",
      expert_query: "Experto",
      labeling: "Etiquetado",
    },
    risk: {
      low: "bajo",
      medium: "medio",
      high: "alto",
      critical: "crítico",
    },
    confidence: "Confianza del agente: {{percent}}%",
    expiresIn: "Caduca en {{minutes}} min",
    additionalContext: "Contexto adicional",
    commentLabel: "Comentario (opcional)",
    commentPlaceholder: "Notas adicionales...",
    yourConfidence: "Tu confianza: {{percent}}%",
    respond: "Responder",
  },
} as const;
