# Animación A2A para la landing — diseño

> Fecha: 2026-09-13 · Estado: implementado

## Problema

La landing explica con `FlowDemo` el loop humano-en-el-bucle (A2H): el agente
se detiene en `ask_human`, una persona responde, el grafo continúa. Desde v1.0
los agentes también se hablan entre ellos: un lead asigna subtareas, los peers
las reciben en su buzón A2A, preguntan, entregan artifacts, y el proyecto se
completa sin ningún humano. La landing no lo cuenta.

## Brainstorm

Opciones barajadas:

1. **Swimlanes animadas** — tres carriles (lead, backend, frontend) con un eje
   temporal común. Muestra máquinas distintas coordinándose. Es el candidato.
2. Un único rail con nodos `assign → await_peer → collect` — correcto pero no
   transmite "agentes en paralelo en otras máquinas".
3. Una tarjeta de buzón que se llena — le falta la dinámica de entregas.

Gana **1**, con un panel de proyecto debajo (como el `QueryPanel` del A2H) que
muestra los dos subtasks, el intercambio de mensajes (pregunta/respuesta) y los
artifacts entregados.

## Diseño

- **Familia visual**: misma que `FlowDemo` — dark theme, dots `NodeDot`
  (pending/running/waiting/done/untaken), chips `NodeLabel`, edges SVG con
  `edge-flow`, `animate-fade-in`, `prefers-reduced-motion`, layouts horizontal
  y vertical (mobile).
- **Historia**: un lead reparte dos subtareas (backend y frontend) en paralelo;
  el backend pregunta "¿TS o JS?" y el lead responde en el mismo contexto
  (multi-turno); ambos entregan artifacts; el lead recoge y cierra el proyecto.
- **El humano queda fuera**: la espera ya no es sobre una persona, es sobre un
  peer. La inversión del A2H se subraya en el panel: `waiting on a peer`.
- **Nodos**: nombres en código (no traducidos), detalles como claves i18n.
- **i18n**: namespace `a2aflow.*` en los tres catálogos (en/es/ca).
- **Colocación**: sección nueva tras `FlowDemo` en `LandingPage`.

## Estado del proyecto (panel)

- Lead: `__start__ → assign_tasks → answer_peer → collect_artifacts → __end__`
- Backend: `mailbox → implement → input_required → deliver`
- Frontend: `mailbox → implement → deliver`
- Entregas: `login.ts` (backend), `login.tsx` (frontend).