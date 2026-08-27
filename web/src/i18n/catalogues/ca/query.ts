export default {
  page: {
    gone: {
      title: "Aquest enllaç ja no funciona",
      body: "Pot ser que ja s'hagi fet servir, o que la pregunta s'hagi tancat. Inicia sessió a l'app per veure què encara espera la teva resposta.",
    },
    answered: {
      title: "Resposta enviada",
      body: "Gràcies — ja pots tancar aquesta pàgina.",
    },
    returned: {
      title: "Retornada per demanar més detall",
      body: "Et respondran. Aquest enllaç continua funcionant, així que hi pots tornar.",
    },
    asking: "t'està fent una pregunta",
    contextLabel: "Context",
    send: "Enviar resposta",
    cantAnswer: "No puc respondre això",
    sendBack: "Retornar-la",
    sendFailed: "No s'ha pogut enviar. Torna-ho a provar.",
  },
  context: {
    about: "Sobre això",
    priorDecision: "Vas decidir sobre això el {{date}}.",
    selfContained: "Autocontingut — no hi ha res més a consultar.",
    openLink: "Obrir l'enllaç referenciat",
    showReferent: "Mostrar el referent",
    hideReferent: "Amagar el referent",
    whatChanged: "Què ha canviat",
    material: "important",
  },
  reasons: {
    unknown_subject: "No sé de què va això",
    missing_delta: "No sé què ha canviat des de l'última vegada",
    unclear_consequences: "No sé què faria cada opció",
    referent_unreachable: "No puc veure allò sobre el qual es pregunta",
    not_my_decision: "Això no és una decisió meva",
  },
  answer: {
    unsupportedKind:
      "Aquesta pregunta demana una resposta d'un tipus que aquesta app no reconeix ({{kind}}). Recarrega la pàgina per tenir l'última versió; si continua passant, l'agent ha de tornar a preguntar en un format que aquesta app admeti.",
    fields: {
      corrected: "corregit",
      proposed: "proposat",
      select: "Selecciona…",
    },
    scalar: {
      between: "Entre {{min}} i {{max}} {{unit}}",
      atLeast: "Com a mínim {{min}} {{unit}}",
      atMost: "Com a màxim {{max}} {{unit}}",
    },
    text: {
      placeholder: "Escriu la teva resposta...",
    },
    insufficient: {
      trigger: "No tinc prou context per respondre això",
      heading: "Què falta?",
      notePlaceholder: "Alguna cosa més que l'agent hagi de saber? (opcional)",
      submit: "Retornar a l'agent",
      reasons: {
        unknown_subject: {
          label: "No sé de què va això",
          description: "No reconec l'assumpte.",
        },
        missing_delta: {
          label: "No sé què ha canviat",
          description: "Això fa referència a una decisió anterior però no diu què és diferent ara.",
        },
        unclear_consequences: {
          label: "No sé què passa si responc",
          description: "No tinc clar a què porta cada opció.",
        },
        referent_unreachable: {
          label: "No puc accedir al que es referencia",
          description: "L'enllaç, l'adjunt o el fitxer no és accessible per a mi.",
        },
        not_my_decision: {
          label: "Això no és una decisió meva",
          description: "Hauria de respondre-hi una altra persona.",
        },
      },
    },
  },
  card: {
    type: {
      validation: "Validació",
      interpretation: "Interpretació",
      expert_query: "Expert",
      labeling: "Etiquetatge",
    },
    risk: {
      low: "baix",
      medium: "mitjà",
      high: "alt",
      critical: "crític",
    },
    confidence: "Confiança de l'agent: {{percent}}%",
    expiresIn: "Caduca en {{minutes}} min",
    additionalContext: "Context addicional",
    commentLabel: "Comentari (opcional)",
    commentPlaceholder: "Notes addicionals...",
    yourConfidence: "La teva confiança: {{percent}}%",
    respond: "Respondre",
  },
} as const;
