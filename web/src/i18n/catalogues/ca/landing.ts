export default {
  nav: {
    features: "Funcions",
    how: "Com funciona",
    code: "Codi",
    docs: "Docs",
    github: "GitHub",
    toggleMenu: "Obrir el menú",
    dashboard: "Tauler",
    login: "Entra",
  },
  hero: {
    badge: "La plataforma de missatgeria pensada per a agents",
    headline: "Els teus agents pregunten. <accent>El teu equip respon</accent> en un clic.",
    subhead:
      "Quan el teu agent d'IA necessita que decideixi una persona, envia una crida a l'API. El teu equip rep un correu, hi entra amb el codi que porta dins i respon al xat. Sense crear cap compte. Sense contrasenya. Sense perdre el context.",
    docsLink: "O llegeix primer la documentació",
    reassurance: {
      noCard: {
        title: "Sense targeta de crèdit",
        detail: "El formulari demana una cosa: el nom del teu agent.",
      },
      noAccount: {
        title: "Sense cap compte a crear",
        detail: "El teu equip respon al xat on apunta el correu.",
      },
      fast: {
        title: "La teva clau en 15 segons",
        detail: "Es mostra una sola vegada, en aquesta pàgina. Copia-la i ja pots integrar.",
      },
    },
  },
  flow: {
    heading: "Mira el cicle sencer funcionant",
    intro:
      "Un graf avança fins que arriba a una decisió que no li toca a l'agent. Allà s'atura, una persona respon amb les conseqüències al davant i la resposta torna estructurada — així el graf continua i tanca l'operació.",
    laneAgent: "agent",
    laneHuman: "persona",
    status: {
      ready: "a punt",
      waiting: "en pausa per una persona",
      held: "en revisió",
      closed: "tancat",
      running: "en marxa",
    },
    // The unit is joined to its number with a non-breaking space: the chip is
    // narrow enough that a plain space drops the "s" onto a line of its own.
    node: {
      start: "l'agent invoca el seu graf",
      gatherContext: "llegeix 4 fonts · 8 s",
      askHuman: "cedeix la decisió",
      applyDecision: "escriu la resposta · 0,4 s",
      end: "l'agent tanca l'operació",
      untaken: "no s'ha pres en aquesta execució",
      escalateHeld: "en revisió · no s'escriu res",
    },
    query: {
      risk: "risc mitjà",
      subject: "Assumpte · registre #A-1042",
      answered: "resposta",
      waiting: "esperant {{clock}}",
      question: "Aproves aquesta operació?",
      chosen: "triada",
      choose: "tria",
    },
    options: {
      apply: {
        label: "Opció A",
        consequence: "S'aplica ara. L'operació es tanca avui.",
      },
      escalate: {
        label: "Opció B",
        consequence: "Queda en revisió. Encara no s'escriu res.",
      },
    },
    footnote:
      "Una persona ha ocupat el lloc d'una regla fixa. Tota la resta és el graf que ja tens.",
    footnoteReduced: "Animació en pausa: el teu sistema demana moviment reduït.",
  },
  features: {
    heading: "La capa que falta entre els teus agents i el teu equip",
    intro:
      "Els teus agents són autònoms — fins que deixen de ser-ho. Quan arriben a una decisió que necessita una persona, AgentDialog aconsegueix la resposta sense trencar el flux.",
    docsLink: "Llegeix la documentació",
    items: {
      email: {
        title: "Avís per correu, resposta en un clic",
        description:
          "Qui ha de decidir rep un correu tan bon punt el teu agent el necessita, hi entra amb un codi en lloc d'una contrasenya i respon al xat on viu aquella conversa.",
      },
      mcp: {
        title: "Pregunta a persones des de qualsevol agent MCP",
        description:
          "Si el teu agent parla MCP — Claude, LangChain o el teu propi — pot fer una pregunta a una persona amb una sola crida d'eina i rebre una resposta estructurada.",
      },
      risk: {
        title: "Aprovacions amb el risc al davant",
        description:
          "Els agents etiqueten cada acció amb un nivell de risc — baix, mitjà, alt o crític. Qui respon veu la gravetat d'un cop d'ull i aprova o denega en un clic.",
      },
      forms: {
        title: "Formularis interactius",
        description:
          "Els agents envien formularis estructurats amb desplegables, números i camps de text. Es completen directament al xat — sense enllaços externs.",
      },
      tools: {
        title: "Les eines a la vista, en directe",
        description:
          "Mira treballar els teus agents en temps real: quines eines criden, què els envien i què reben. Transparència completa, zero endevinalles.",
      },
      status: {
        title: "Estat en directe, sense polling",
        description:
          "El teu agent veu per WebSocket qui està escrivint, qui ho ha llegit i en quin punt és l'aprovació, a mesura que passa. Sense bucles de sondeig ni estat caducat. I hi ha webhooks per als fluxos asíncrons.",
      },
    },
  },
  how: {
    heading: "De zero a diàleg en 60 segons",
    intro:
      "El teu agent porta tot el flux. Ningú comença una conversa des de l'altre costat: es responen les que obre el teu agent.",
    cta: "Comença",
    ctaNote: "Gratis, sense targeta de crèdit",
    steps: {
      ask: {
        title: "L'agent pregunta",
        description:
          "Una crida d'eina MCP. El teu agent envia una pregunta per correu a qui calgui. Sense taulers ni fitxers de configuració — només human_query() i ja està.",
      },
      answer: {
        title: "Una persona respon",
        description:
          "Un correu avisa que hi ha una pregunta esperant. S'obre, s'hi entra amb un codi — cap contrasenya per recordar — i es respon al xat, al costat dels fitxers, formularis i aprovacions d'aquella conversa.",
      },
      receive: {
        title: "L'agent rep la resposta",
        description:
          "La resposta li arriba a l'agent tota sola, per webhook o consultant per MCP. Cap tauler per vigilar.",
      },
    },
  },
  examples: {
    heading: "Tres crides a l'API. Aquesta és la integració.",
    intro:
      "Registrar-se, crear una conversa, enviar un missatge. Funciona des de cURL, TypeScript, Python o qualsevol cosa que parli HTTP. <docs>Documentació completa de l'API</docs>",
    tabs: {
      mcp: "MCP (Claude)",
      curl: "cURL",
      typescript: "TypeScript",
      python: "Python",
    },
  },
  guide: {
    badge: "Guia de desenvolupament",
    heading: "Tot el que necessites en un sol document",
    intro:
      "Llegeix la guia d'integració completa i tingues el teu agent parlant amb persones en minuts. L'única cosa que necessita és una API key.",
    docsLink: "Llegeix la documentació",
    download: "o descarrega-la en Markdown",
    highlights: {
      quickstart: "Arrencada ràpida en 5 minuts amb cURL, TypeScript o Python",
      queries:
        "MCP Human Queries: pregunta a una persona amb una crida d'eina i rep una resposta estructurada",
      messages: "Missatges estructurats: formularis, aprovacions i avisos",
      email:
        "Avisos per correu i entrada sense contrasenya — ningú s'ha de crear cap compte",
      realtime: "WebSocket en temps real, webhooks i SDK per a TypeScript i Python",
    },
  },
  faq: {
    heading: "Les preguntes que val la pena fer-se abans",
    items: {
      account: {
        question: "El meu equip necessita un compte?",
        answer:
          "No. Rep un correu. Una pregunta de risc <code>low</code> o <code>medium</code> porta un enllaç que obre aquella pregunta i la resol; les de risc <code>high</code> i <code>critical</code> porten un codi d'entrada. En cap moment hi ha contrasenya.",
      },
      inboundEmail: {
        question: "I si algú contesta el correu?",
        answer:
          "No ho llegeix ningú, i és una decisió, no un descuit. El correu entrant no es processa: la resposta arriba a una bústia amb una resposta automàtica que torna qui escriu cap a l'aplicació. Es respon al xat o a l'enllaç d'un clic.",
      },
      delivery: {
        question: "Com se n'assabenta el meu agent, de la resposta?",
        answer:
          "Per webhook, si té una URL pública a l'escolta. Un agent que corre dins d'un client MCP no en pot rebre cap — no és un servidor — així que la demana amb <code>get_query</code> i la resposta hi és. Una eina que esperi en lloc de preguntar és al full de ruta per a la v0.9.",
      },
      admission: {
        question: "Puc preguntar qualsevol cosa?",
        answer:
          "No, i aquí hi ha el producte. Una query és tipada, i un filtre d'admissió rebutja les preguntes que ningú no podria decidir de debò: un assumpte sense res a mirar, un risc per damunt de <code>low</code> sense les conseqüències escrites, una decisió repetida que no diu què ha canviat. El <code>422</code> porta un camp <code>remedy</code> que anomena el que falta.",
      },
      linkSafety: {
        question: "És segur enviar aquest enllaç per correu?",
        answer:
          "L'enllaç és una capacitat per a una sola pregunta. Qui el tingui pot respondre aquella pregunta i res més — ni llegir la conversa, ni veure altres queries, ni arribar al compte. Es gasta en fer-lo servir i caduca amb la pregunta. Els riscos <code>high</code> i <code>critical</code> no generen cap enllaç.",
      },
      integrations: {
        question: "Amb què s'integra?",
        answer:
          "Un SDK de TypeScript a npm, amb adaptadors per a LangChain i l'AI SDK de Vercel. Un servidor MCP per a Claude o qualsevol altre client MCP. REST per a tota la resta. L'SDK de Python és al repositori i encara no es publica — és al full de ruta.",
      },
      riskAuthority: {
        question: "Qui decideix què és risc alt?",
        answer:
          "Ho declara l'agent, i no té l'última paraula. Una pregunta sobre un import per damunt del llindar configurat es tracta com a risc alt digui el que digui l'agent, i risc alt vol dir codi d'entrada en comptes d'enllaç d'un clic. Cap agent no es cola pel camí fàcil en una decisió que mou diners de debò.",
      },
      keyLeak: {
        question: "I si se'm filtra l'API key? Algú pot fer-se passar pel meu agent?",
        answer:
          "Rota-la amb <code>POST /agent/key/rotate</code>: s'emet la nova i l'anterior deixa de funcionar a l'instant. Les claus es guarden com a hashes bcrypt i es mostren una sola vegada, així que una filtració ha de venir del teu costat, no del nostre. Per MCP, qui crida se surt de les credencials a cada petició i mai de l'identificador de sessió — tenir la sessió d'una altra persona no n'hi ha prou per actuar en nom seu.",
      },
      webhookSignature: {
        question: "Com sé que un lliurament ve de debò de vosaltres?",
        answer:
          "Cada lliurament de webhook va signat seguint <spec>Standard Webhooks</spec>, així que el verifiques amb una llibreria de les de sempre en lloc de refiar-te d'un fragment nostre. El que se signa inclou la marca de temps, de manera que un lliurament capturat no es pot reproduir més tard, i una rotació signa alhora amb la clau vella i la nova perquè no es perdi res mentre canvies.",
      },
    },
  },
  cta: {
    heading: "Integrat en 60 segons. De debò.",
    intro:
      "Tres crides a l'API per connectar el teu agent. El teu equip rep un correu, hi entra amb el codi i respon en un clic. Sense cap compte a crear, sense cap contrasenya a recordar.",
    primary: "Aconsegueix la teva API key",
    secondary: "Llegeix la documentació",
    note: "Sense targeta de crèdit. Sense cap compte a crear.",
  },
  form: {
    label: "Posa nom al teu agent",
    placeholder: "Posa nom al teu agent — Agent de Releases",
    submit: "Aconsegueix la teva API key",
    preview: "Es registra com a <slug>{{slug}}</slug>",
    quickstart: "Arrencada ràpida",
    error: {
      taken: "Aquest nom ja està agafat dues vegades. Prova'n un de més concret.",
      rateLimitedMinutes:
        "Massa claus des d'aquesta xarxa. Torna-ho a provar d'aquí a {{minutes}} min, o registra't des del terminal — mira l'arrencada ràpida.",
      rateLimited:
        "Massa claus des d'aquesta xarxa. Registra't des del terminal — mira l'arrencada ràpida.",
      failed: "No s'ha pogut crear la clau. Prova amb l'arrencada ràpida.",
      unreachable: "No s'ha pogut contactar amb l'API. Revisa la connexió i torna-ho a provar.",
    },
    issued: {
      title: "<slug>{{slug}}</slug> ja està en marxa. Aquesta és la seva clau.",
      warning: "Es mostra una sola vegada. Copia-la ara — perdre-la obliga a rotar la clau.",
      configLabel: "Enganxa-la a la configuració del teu client MCP:",
      next: "Ara pregunta-li alguna cosa a una persona →",
    },
  },
  footer: {
    tagline: "Plataforma de missatgeria pensada per a agents. Feta per a l'era de la IA.",
    github: "GitHub",
    docs: "Docs",
  },
  notFound: {
    message: "Pàgina no trobada",
    home: "Torna a l'inici",
  },
} as const;
