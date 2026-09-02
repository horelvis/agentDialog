export default {
  nav: {
    features: "Funciones",
    how: "Cómo funciona",
    code: "Código",
    docs: "Docs",
    toggleMenu: "Abrir o cerrar el menú",
    dashboard: "Panel",
    login: "Entrar",
  },
  hero: {
    badge: "La plataforma de mensajería pensada para agentes",
    headline: "Tus agentes preguntan. <accent>El Humano responde</accent> en un clic.",
    subhead:
      "Cuando tu agente de IA necesita que decida una persona, envía una sola llamada a la API. Tu equipo recibe un correo, entra con el código que lleva dentro y responde en el chat. Sin crear cuenta. Sin contraseña. Sin perder el contexto.",
    docsLink: "O lee primero la documentación",
    reassurance: {
      noCard: {
        title: "Sin tarjeta de crédito",
        detail: "El formulario pide una cosa: el nombre de tu agente.",
      },
      noAccount: {
        title: "Sin cuenta que crear",
        detail: "El Humano responde en el chat al que apunta el correo.",
      },
      fast: {
        title: "Tu clave en 15 segundos",
        detail: "Se muestra una sola vez, en esta página. Cópiala y a integrar.",
      },
    },
  },
  flow: {
    heading: "Mira el ciclo entero funcionando",
    intro:
      "Un grafo avanza hasta que llega a una decisión que no le toca al agente. Ahí se para, una persona responde con las consecuencias delante y la respuesta vuelve estructurada — así el grafo sigue y cierra la operación.",
    laneAgent: "agente",
    laneHuman: "persona",
    status: {
      ready: "listo",
      waiting: "en pausa por una persona",
      held: "en revisión",
      closed: "cerrado",
      running: "en marcha",
    },
    // The unit is joined to its number with a non-breaking space: the chip is
    // narrow enough that a plain space drops the "s" onto a line of its own.
    node: {
      start: "el agente invoca su grafo",
      gatherContext: "lee 4 fuentes · 8 s",
      askHuman: "cede la decisión",
      applyDecision: "escribe la respuesta · 0,4 s",
      end: "el agente cierra la operación",
      untaken: "no se tomó en esta ejecución",
      escalateHeld: "en revisión · no se escribe nada",
    },
    query: {
      risk: "riesgo medio",
      subject: "Asunto · registro #A-1042",
      answered: "respondida",
      waiting: "esperando {{clock}}",
      question: "¿Apruebas esta operación?",
      chosen: "elegida",
      choose: "elegir",
    },
    options: {
      apply: {
        label: "Opción A",
        consequence: "Se aplica ya. La operación se cierra hoy.",
      },
      escalate: {
        label: "Opción B",
        consequence: "Queda en revisión. Todavía no se escribe nada.",
      },
    },
    footnote:
      "Una persona ocupó el lugar de una regla fija. Todo lo demás es el grafo que ya tienes.",
    footnoteReduced: "Animación en pausa: tu sistema pide movimiento reducido.",
  },
  features: {
    heading: "La capa que falta entre tus agentes y tu equipo",
    intro:
      "Tus agentes son autónomos — hasta que dejan de serlo. Cuando llegan a una decisión que necesita a una persona, AgentDialog consigue la respuesta sin romper el flujo.",
    docsLink: "Lee la documentación",
    items: {
      email: {
        title: "Aviso por correo, respuesta en un clic",
        description:
          "Quien tiene que decidir recibe un correo en cuanto tu agente lo necesita, entra con un código en lugar de una contraseña y responde en el chat donde vive esa conversación.",
      },
      mcp: {
        title: "Pregunta a personas desde cualquier agente MCP",
        description:
          "Si tu agente habla MCP — Claude, LangChain o el tuyo propio — puede hacerle una pregunta a una persona con una sola llamada de herramienta y recibir una respuesta estructurada.",
      },
      risk: {
        title: "Aprobaciones con el riesgo delante",
        description:
          "Los agentes etiquetan cada acción con un nivel de riesgo — bajo, medio, alto o crítico: low, medium, high, critical. Quien responde ve la gravedad de un vistazo y aprueba o deniega en un clic.",
      },
      forms: {
        title: "Formularios interactivos",
        description:
          "Los agentes envían formularios estructurados con desplegables, números y campos de texto. Se rellenan directamente en el chat — sin enlaces externos.",
      },
      tools: {
        title: "Herramientas a la vista, en directo",
        description:
          "Mira trabajar a tus agentes en tiempo real: qué herramientas llaman, qué les envían y qué reciben. Transparencia completa, cero adivinar.",
      },
      status: {
        title: "Estado en directo, sin polling",
        description:
          "Tu agente ve por WebSocket quién está escribiendo, quién ha leído y en qué punto está la aprobación, según ocurre. Sin bucles de sondeo ni estado caducado. Y hay webhooks para los flujos asíncronos.",
      },
    },
  },
  how: {
    heading: "De cero a diálogo en 60 segundos",
    intro:
      "Tu agente lleva todo el flujo. Nadie empieza una conversación desde el otro lado: se responde a las que abre tu agente.",
    cta: "Empieza",
    ctaNote: "Gratis, sin tarjeta de crédito",
    steps: {
      ask: {
        title: "El agente pregunta",
        description:
          "Una llamada de herramienta MCP. Tu agente envía una pregunta por correo a quien haga falta. Sin paneles ni ficheros de configuración — solo human_query() y ya está.",
      },
      answer: {
        title: "Una persona responde",
        description:
          "Un correo avisa de que hay una pregunta esperando. Se abre, se entra con un código — nada de contraseñas que recordar — y se responde en el chat, junto a los ficheros, formularios y aprobaciones de esa conversación.",
      },
      receive: {
        title: "El agente recibe la respuesta",
        description:
          "La respuesta le llega al agente sola, por webhook o consultando por MCP. Sin ningún panel que vigilar.",
      },
    },
  },
  examples: {
    heading: "Tres llamadas a la API. Esa es la integración.",
    intro:
      "Registrarse, crear una conversación, enviar un mensaje. Funciona desde cURL, TypeScript, Python o cualquier cosa que hable HTTP. <docs>Documentación completa de la API</docs>",
    tabs: {
      curl: "cURL",
      typescript: "TypeScript",
      python: "Python",
    },
  },
  guide: {
    badge: "Guía de desarrollo",
    heading: "Todo lo que necesitas en un solo documento",
    intro:
      "Lee la guía de integración completa y en unos minutos tu agente estará hablando con personas. Lo único que necesita es una API key.",
    docsLink: "Lee la documentación",
    download: "o descárgala en Markdown",
    highlights: {
      quickstart: "Arranque rápido en 5 minutos con cURL, TypeScript o Python",
      queries:
        "MCP Human Queries: pregunta a una persona con una llamada de herramienta y recibe una respuesta estructurada",
      messages: "Mensajes estructurados: formularios, aprobaciones y avisos",
      email:
        "Avisos por correo y entrada sin contraseña — nadie tiene que crearse una cuenta",
      realtime: "WebSocket en tiempo real, webhooks y SDK para TypeScript y Python",
    },
  },
  faq: {
    heading: "Las preguntas que conviene hacerse antes",
    items: {
      account: {
        question: "¿Mi equipo necesita una cuenta?",
        answer:
          "No. Recibe un correo. Una pregunta de riesgo <code>low</code> o <code>medium</code> lleva un enlace que abre esa pregunta y la resuelve; las de riesgo <code>high</code> y <code>critical</code> llevan un código de entrada. En ningún momento hay contraseña.",
      },
      inboundEmail: {
        question: "¿Y si alguien contesta al correo?",
        answer:
          "No lo lee nadie, y es una decisión, no un descuido. El correo entrante no se procesa: una contestación llega a un buzón con una respuesta automática que remite de vuelta a la aplicación a quien escribe. Se responde en el chat o en el enlace de un clic.",
      },
      delivery: {
        question: "¿Cómo se entera mi agente de la respuesta?",
        answer:
          "Por webhook, si tiene una URL pública a la escucha. Un agente que corre dentro de un cliente MCP no puede recibir ninguno — no es un servidor — así que la pide con <code>get_query</code> y ahí está la respuesta. Una herramienta que espere en lugar de preguntar está en la hoja de ruta para la v0.10.",
      },
      admission: {
        question: "¿Puedo preguntar cualquier cosa?",
        answer:
          "No, y ahí está el producto. Una query está tipada, y un filtro de admisión rechaza las preguntas que nadie podría decidir de verdad: un asunto sin nada que mirar, un riesgo por encima de <code>low</code> sin las consecuencias escritas, una decisión repetida que no dice qué ha cambiado. El <code>422</code> trae un campo <code>remedy</code> que nombra lo que falta.",
      },
      linkSafety: {
        question: "¿Es seguro mandar ese enlace por correo?",
        answer:
          "El enlace es una capacidad para una sola pregunta. Quien lo tenga puede responder esa pregunta y nada más — ni leer la conversación, ni ver otras queries, ni llegar a la cuenta. Se gasta al usarlo y caduca con la pregunta. Los riesgos <code>high</code> y <code>critical</code> no generan ningún enlace.",
      },
      integrations: {
        question: "¿Con qué se integra?",
        answer:
          "Un SDK de TypeScript en npm, con adaptadores para LangChain y el AI SDK de Vercel. Un servidor MCP para Claude o cualquier otro cliente MCP. REST para todo lo demás. El SDK de Python está en el repositorio y todavía no se publica — está en la hoja de ruta.",
      },
      riskAuthority: {
        question: "¿Quién decide qué es riesgo alto?",
        answer:
          "Lo declara el agente, y no tiene la última palabra. Una pregunta sobre un importe por encima del umbral configurado se trata como riesgo alto diga lo que diga el agente, y riesgo alto significa código de entrada en vez de enlace de un clic. Ningún agente se cuela por el camino fácil en una decisión que mueve dinero de verdad.",
      },
      keyLeak: {
        question: "¿Y si se filtra mi API key? ¿Alguien puede hacerse pasar por mi agente?",
        answer:
          "Rótala con <code>POST /agent/key/rotate</code>: se emite la nueva y la anterior deja de funcionar al instante. Las claves se guardan como hashes bcrypt y se muestran una sola vez, así que una filtración tiene que venir de tu lado, no del nuestro. Por MCP, quien llama se deduce de las credenciales en cada petición y nunca del identificador de sesión — tener la sesión de otra persona no basta para actuar en su nombre.",
      },
      webhookSignature: {
        question: "¿Cómo sé que una entrega viene de verdad de vosotros?",
        answer:
          "Cada entrega de webhook va firmada siguiendo <spec>Standard Webhooks</spec>, así que la verificas con una librería de las de siempre en lugar de fiarte de un fragmento nuestro. Lo firmado incluye la marca de tiempo, de modo que una entrega capturada no se puede reproducir más tarde, y una rotación firma a la vez con la clave vieja y la nueva para que no se pierda nada mientras cambias.",
      },
    },
  },
  cta: {
    heading: "Integrado en 60 segundos. En serio.",
    intro:
      "Tres llamadas a la API para conectar tu agente. Tu equipo recibe un correo, entra con el código y responde en un clic. Sin cuenta que crear, sin contraseña que recordar.",
    primary: "Consigue tu API key",
    secondary: "Lee la documentación",
    note: "Sin tarjeta de crédito. Sin cuenta que crear.",
  },
  form: {
    label: "Ponle nombre a tu agente",
    placeholder: "Ponle nombre a tu agente — Agente de Releases",
    submit: "Consigue tu API key",
    preview: "Se registra como <slug>{{slug}}</slug>",
    quickstart: "Arranque rápido",
    error: {
      taken: "Ese nombre ya está en uso dos veces. Prueba con uno más concreto.",
      rateLimitedMinutes:
        "Demasiadas claves desde esta red. Vuelve a intentarlo en {{minutes}} min, o regístrate desde la terminal — mira el arranque rápido.",
      rateLimited:
        "Demasiadas claves desde esta red. Regístrate desde la terminal — mira el arranque rápido.",
      failed: "No se ha podido crear la clave. Prueba con el arranque rápido.",
      unreachable: "No se ha podido contactar con la API. Revisa tu conexión y vuelve a intentarlo.",
    },
    issued: {
      title: "<slug>{{slug}}</slug> está en marcha. Esta es su clave.",
      warning: "Se muestra una sola vez. Cópiala ahora — perderla obliga a rotar la clave.",
      configLabel: "Pégala en la configuración de tu cliente MCP:",
      next: "Ahora pregúntale algo a una persona →",
    },
  },
  notFound: {
    message: "Página no encontrada",
    home: "Volver al inicio",
  },
} as const;
