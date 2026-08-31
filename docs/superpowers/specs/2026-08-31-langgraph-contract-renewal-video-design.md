# Vídeo: validación humana de una renovación contractual con LangGraph

## Objetivo

Crear una continuación del vídeo «Hola mundo con Claude Web y MCP» que muestre
un flujo algo más realista sin convertirse en un tutorial largo. El vídeo debe
explicar cómo un agente valida automáticamente una renovación contractual,
delega una decisión que requiere criterio humano mediante AgentDialog y reanuda
su ejecución en LangGraph con una respuesta estructurada.

El resultado será un MP4 horizontal de 1920 × 1080, narrado en español, con
subtítulos SRT y una duración objetivo de 80 a 90 segundos.

## Audiencia y mensaje

La audiencia son desarrolladores que ya entienden qué es un agente, pero aún no
han visto un caso práctico de humano en el bucle. No se presupone experiencia
con LangGraph.

El mensaje central es:

> Automatiza las reglas. Consulta las decisiones.

AgentDialog no sustituye al sistema de contratos ni toma la decisión legal.
Transporta la pregunta al responsable adecuado, recoge una respuesta tipada y
permite que el grafo continúe.

## Caso de uso

Un agente revisa la renovación ficticia del proveedor «CloudDesk». Extrae estos
datos del contrato:

- renovación automática por doce meses;
- incremento de precio del 8 %;
- diez días restantes para cancelar;
- política interna que exige validación humana cuando el incremento supera el
  5 %.

El agente puede validar los datos objetivos, pero no debe decidir si la empresa
acepta el coste. Crea una consulta de AgentDialog dirigida a Compras con tres
respuestas posibles: aprobar, renegociar o cancelar. La responsable elige
«Renegociar».

AgentDialog devuelve una respuesta de elección con `option_ids` igual a
`["renegotiate"]`. LangGraph toma esa rama, deja la renovación pendiente,
prepara un borrador con un incremento máximo del 5 % y crea una tarea anterior
a la fecha límite de cancelación.

Todos los nombres, cláusulas, importes y fechas que aparezcan serán ficticios.

## Estructura narrativa

1. **Gancho — El problema.** El contrato se renovará automáticamente dentro de
   diez días.
2. **Análisis automático.** LangGraph extrae la cláusula, el incremento y la
   fecha límite.
3. **Validación.** La política permite automatizar incrementos de hasta el 5 %;
   el 8 % requiere criterio humano.
4. **Consulta.** El grafo crea una pregunta estructurada mediante AgentDialog e
   incluye solo la cláusula y el contexto relevantes.
5. **Decisión humana.** Compras recibe la consulta y selecciona «Renegociar».
6. **Reanudación.** LangGraph recibe la respuesta tipada y toma la rama de
   renegociación.
7. **Resultado.** Se generan el borrador y la tarea antes del vencimiento.
8. **Cierre.** Se muestra el mensaje central y la dirección de la documentación.

## Tratamiento visual

El vídeo reutilizará la identidad del primer tutorial: fondo oscuro, morado de
AgentDialog, tipografía del sistema, tarjetas redondeadas y transiciones suaves.
Será una pieza híbrida compuesta por:

- diagramas animados del flujo de LangGraph;
- una representación breve del código Python, limitada a las líneas que crean
  la consulta y enrutan la respuesta;
- una interfaz simulada de AgentDialog para la decisión de Compras;
- indicadores visuales para comparar el umbral permitido del 5 % con el aumento
  detectado del 8 %.

No se mostrarán credenciales reales ni una captura de un contrato real. La API
base será `https://api.agentdialog.io/api/v1` y las propiedades REST aparecerán
en `snake_case`.

## Audio y accesibilidad

La narración será en español, con ritmo calmado y frases cortas. Cada escena
tendrá una locución independiente para facilitar cambios y sincronización. Los
subtítulos SRT reproducirán el sentido completo de la narración y se entregarán
junto al vídeo.

El contraste, el tamaño de texto y el tiempo en pantalla deben permitir leer el
contenido sin depender de la narración. El vídeo no dependerá exclusivamente
del color para distinguir estados.

## Artefactos

La producción seguirá el pipeline local existente en
`docs-site/video-src/hola-mundo-claude-mcp/`, sin modificar ni renombrar sus
archivos. La nueva pieza tendrá su propio directorio y generará:

- fuentes de escenas y narración;
- diapositivas generadas;
- línea de tiempo;
- póster;
- subtítulos SRT;
- MP4 final en `docs-site/public/videos/`.

## Verificación

Antes de entregar el vídeo se comprobará:

- que todas las escenas declaradas tienen audio y recursos visuales;
- que la respuesta usada por LangGraph es `renegotiate`;
- que no aparecen dominios, claves o datos personales incorrectos;
- que el MP4 contiene pistas de vídeo y audio, tiene resolución 1920 × 1080 y
  una duración dentro del objetivo;
- que los subtítulos cubren toda la narración y mantienen tiempos crecientes;
- que el póster y el primer fotograma representan correctamente el caso de uso.

