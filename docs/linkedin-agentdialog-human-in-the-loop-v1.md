# LinkedIn post — AgentDialog human-in-the-loop v1

Los agentes ya pueden hablar con APIs, herramientas y otros agentes.

Pero ¿qué ocurre cuando necesitan criterio humano para continuar?

Por ejemplo:

- validar un informe antes de enviarlo;
- aprobar un presupuesto;
- confirmar una acción sensible;
- aportar contexto de negocio que no está en ningún sistema;
- revisar una respuesta cuando la confianza del agente es baja.

Hoy podemos resolverlo conectando cada agente con Telegram, WhatsApp, Slack o
email. El problema es que después hay que construir la autenticación, la
entrega, la correlación de respuestas, los timeouts, la persistencia y la forma
de devolver esa respuesta al contexto que entiende el agente.

Human-in-the-loop no es una idea nueva. En el ecosistema LangChain, LangGraph
ya permite pausar y reanudar una ejecución mediante interrupts. También existen
plataformas de aprobación y supervisión humana.

La pregunta que quiero explorar con AgentDialog es otra:

**¿Y si los agentes tuvieran un canal conversacional, agent-first y listo para
integrar, para pedir ayuda a una persona?**

La idea es sencilla:

1. Solo el agente inicia la conversación.
2. El humano recibe la pregunta y responde desde el chat web o directamente por
   email.
3. AgentDialog vincula la respuesta con la conversación y la query originales.
4. El agente recibe una respuesta estructurada y puede continuar su trabajo.

La primera versión cubre chat y email. Más adelante, el mismo modelo podría
extenderse a una llamada telefónica u otros canales, sin obligar al agente a
entender la implementación particular de cada uno.

Estoy construyendo una primera versión y quiero validar el problema antes que la
solución:

**¿En qué momento necesita tu agente detenerse y preguntarle algo a una
persona?**

#AIAgents #HumanInTheLoop #AgenticAI #AIEngineering #AgentDialog

---

## Visual

`linkedin-agentdialog-human-in-the-loop-v1.png`

## Market-claim notes — not part of the post

- LangGraph supports pausing and resuming a graph with `interrupt`:
  <https://langchain-ai.github.io/langgraph/concepts/breakpoints/>
- HumanLayer has offered human oversight through channels such as Slack and
  email, so the post deliberately avoids claiming that no competing solution
  exists:
  <https://www.ycombinator.com/launches/M8e-humanlayer-human-in-the-loop-for-ai-agents-and-beyond>
- Microsoft Copilot Studio supports human approval stages and responses through
  Teams, Outlook and Power Automate:
  <https://learn.microsoft.com/en-us/microsoft-copilot-studio/flows-advanced-approvals>
