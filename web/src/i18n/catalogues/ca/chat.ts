export default {
  shared: {
    untitledConversation: "Sense títol",
    newConversation: "Conversa",
    you: "Tu",
    agent: "Agent",
    user: "Usuari",
  },
  list: {
    sectionTitle: "Converses",
    empty: "Encara no hi ha converses",
  },
  header: {
    participants_one: "{{count}} participant",
    participants_other: "{{count}} participants",
    status: {
      active: "activa",
      archived: "arxivada",
      closed: "tancada",
    },
  },
  input: {
    placeholder: "Escriu un missatge...",
  },
  empty: {
    title: "Selecciona una conversa",
    body: "Tria una conversa a la barra lateral, o accepta una invitació per començar.",
  },
  typing: {
    one: "L'agent està escrivint...",
    many: "Diversos estan escrivint...",
  },
  messages: {
    approval: {
      title: "Aprovació requerida",
      action: "Acció: {{action}}",
      approve: "Aprova",
      deny: "Denega",
      approved: "Aprovat",
      denied: "Denegat",
    },
    toolCall: {
      input: "Entrada",
      status: {
        pending: "pendent",
        running: "en curs",
        completed: "completat",
        failed: "fallit",
      },
    },
    toolResult: {
      output: "Sortida",
      result: "Resultat",
    },
    form: {
      submitted: "Enviat",
      submit: "Envia",
      select: "Selecciona…",
    },
    formResponse: {
      title: "Resposta del formulari",
    },
    humanQuery: {
      question: "Pregunta",
    },
    humanQueryResponse: {
      confidence: "Confiança: {{percent}}%",
      yes: "Sí",
      no: "No",
    },
    file: {
      unavailable: "Fitxer no disponible",
      downloading: "Descarregant…",
    },
    voiceNote: {
      unavailable: "Nota de veu no disponible",
      error: "Error",
    },
    notification: {
      fallbackTitle: "Notificació",
    },
  },
  queries: {
    title: "Queries",
    body: "Preguntes dels agents. Obre'n una per respondre-la a la seva conversa.",
    emptyTitle: "No hi ha queries pendents.",
    emptyBody: "Quan els agents t'enviïn preguntes, apareixeran aquí.",
    waitingOnAgent: "Esperant que l'agent aclareixi",
    answerCta: "Respon →",
  },
  invitations: {
    title: "Invitacions",
    body: "Accepta o declina invitacions a converses enviades per agents.",
    emptyTitle: "No hi ha invitacions pendents",
    emptyBody: "Quan un agent et convidi a una conversa, apareixerà aquí.",
    untitled: "Invitació a conversa",
    from: "enviada per <name>{{name}}</name>",
    accept: "Accepta",
    decline: "Rebutja",
    status: {
      pending: "pendent",
      accepted: "acceptada",
      declined: "rebutjada",
      expired: "caducada",
      revoked: "revocada",
    },
  },
  settings: {
    title: "Ajustos",
    body: "Gestiona els ajustos del teu compte.",
    emailLabel: "Correu electrònic",
    displayNameLabel: "Nom visible",
    displayNamePlaceholder: "Com et veuen els altres",
    saveChanges: "Desa els canvis",
    saved: "Desat!",
    sessionTitle: "Sessió",
    sessionBody: "Gestiona la teva sessió actual.",
    signOut: "Tanca la sessió",
  },
  agents: {
    title: "Agents de confiança",
    body: "Agents de qui ja has acceptat invitacions. Les properes invitacions d'agents de confiança s'accepten automàticament.",
    emptyTitle: "Encara no hi ha agents de confiança.",
    emptyBody: "Tan bon punt acceptis una invitació d'un agent, apareixerà aquí.",
    revoke: "Revoca",
  },
} as const;
