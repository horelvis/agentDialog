# Por qué las human queries tienen que estar tipadas

**Fecha:** 2026-08-21
**Estado:** razonamiento aceptado; el spec de diseño se escribe a continuación
**Ámbito:** `human_query` — la primitiva expuesta por MCP, REST y el SDK

Este documento no es un diseño. Es el argumento del que el diseño va a partir,
escrito aparte porque el argumento es la parte que se pierde: dentro de seis
meses el spec dirá *qué* se construyó y nadie recordará contra qué problema.

## El hecho incómodo del que sale todo

Dos validadores, a treinta líneas uno del otro en `src/validators/message.validators.ts`:

```ts
approvalResponseData   = { approvalId, decision: z.enum(["approved","denied"]), reason? }
humanQueryResponseData = { queryId, answer: z.string(), comment?, confidence? }
```

Uno tiene **espacio de decisión cerrado**. El otro, prosa.

No es que falte una funcionalidad: es que el repositorio **ya sabe hacer esto** y
lo hace para la primitiva menos usada. `approval` es un tipo de mensaje dentro de
una conversación; `human_query` es lo que un agente llama por MCP, el camino real
del producto. La primitiva más expuesta es la que menos sabe de sí misma.

Lo mismo pasa en la pregunta: `approval` lleva `riskLevel`; las queries no tienen
nada equivalente. Y `queryType` —`validation | interpretation | expert_query |
labeling`— describe **la tarea cognitiva**, nunca **lo que está en juego**.

## La pregunta se modela como si se bastara a sí misma

```ts
question: z.string().min(1).max(10_000),
context:  z.string().max(100_000).optional(),   // opcional, y prosa
```

Una renovación de contrato no es una pregunta sobre un documento: es una pregunta
sobre **un delta respecto a un estado que se presume que el humano recuerda**. Y
casi nunca lo recuerda. No sabe cuál de los contratos es, ni qué cláusulas
cambiaron desde que dijo que sí la última vez.

El agente sí lo sabe —hizo el diff para llegar hasta aquí— pero el tipo de dato no
tiene dónde ponerlo, así que se aplana a prosa o se pierde.

Dicho sin rodeos: **la API permite formular una pregunta indecidible y la acepta
como válida.** Puedes validar que `question` no esté vacío; no puedes validar que
sea contestable. Con `context` opcional, un agente puede pedir 40.000 € con
contexto `undefined` y el `201` sale igual.

## «Siempre puede rechazar» no es la red de seguridad que parece

Dos razones.

**Rechazar sin entender no es un fallo seguro, es otro fallo distinto.** Si el
humano rechaza una renovación rutinaria porque no la reconoce, el proceso se para.
Has cambiado un riesgo por otro.

**La presión no es simétrica.** Quien no entiende y no quiere parecer un
obstáculo, aprueba. Es el modo de fallo clásico de todo flujo de aprobación, y el
diseño actual lo optimiza sin querer: un botón, contexto truncado a 2.000
caracteres en el email (`query-email.service.ts:15`) y `timeout_minutes` a 60 por
defecto.

Y la consecuencia que mata el argumento de auditoría: **si no puedes distinguir
«aprobó porque lo entendió» de «aprobó para no bloquear», el registro no vale
nada.** Da igual el hash del artefacto.

## Falta la tercera respuesta

```ts
respondQuerySchema = { answer: z.string().min(1), ... }
queryStatusEnum    = ["pending", "assigned", "answered", "expired"]
```

El humano **está obligado a producir texto**, y el estado solo admite
«contestada». No existe *«no sé de qué me hablas, dame el diff»*. Ese estado —el
más frecuente en el caso real— se colapsa en un rechazo que bloquea o en un sí que
no debería contar.

## La respuesta libre es entrada no confiable, en las dos direcciones

`answer` y `comment` vuelven al contexto del agente como texto libre de hasta
32.000 caracteres sin marcado: vector de inyección directo. Con espacio de
respuesta cerrado el problema casi desaparece, porque solo se rellenan huecos de
un tipo conocido; `comment` sigue necesitando viajar etiquetado como dato citado,
nunca concatenado como instrucción.

Menos evidente y también real: el agente controla `question` (10.000) y `context`
(100.000), **y eso se renderiza al humano** que va a aprobar. La frontera de
confianza es de dos direcciones.

## Decisiones tomadas

1. **AgentDialog garantiza, no solo transporta.** Una query sin espacio de
   respuesta definido, o sin el contexto que su riesgo exige, se rechaza con
   `422`. Esto significa decirle que no al integrador por su bien, y es la
   diferencia entre un transporte de preguntas y algo con lo que firmar 40.000 €.

2. **El catálogo de respuestas lo posee el producto, no el agente.** `boolean`,
   `choice`, `scalar`, `date`, y `text` marcado explícitamente como débil. El
   agente elige de la lista; no manda un JSON Schema arbitrario. Un schema
   arbitrario choca de frente con la decisión 1 —no se puede verificar que sea
   contestable por un humano— y haría imposible el adaptador de voz, donde el
   espacio cerrado no es una mejora sino un prerrequisito.

3. **El asunto y las consecuencias son obligatorios, y el delta lo exige el
   sistema.** Toda query nombra su asunto (id estable, etiqueta legible, hash
   opcional) y cada opción declara qué provoca. Y como AgentDialog ya guarda el
   historial de (agente, humano, asunto), **detecta él mismo** que ya se preguntó
   antes sobre ese asunto: volver sin declarar qué ha cambiado es `422`. Que el
   sistema lo detecte en vez de fiarse de que el agente lo declare es lo que
   cierra el agujero — si no, el agente lo esquiva omitiendo el dato.

## Por qué el orden importa

Tipar la **respuesta** sin tipar la **pregunta** deja el problema a medias:
tendrías botones limpios de «Aprobar / Rechazar» sobre una pregunta que el humano
sigue sin poder decidir. Un botón bonito sobre contexto insuficiente es
exactamente la máquina de sellar goma descrita arriba. Las tres piezas —espacio
de respuesta cerrado, contexto obligatorio y estructurado, y salida
`insufficient_context`— son una sola pieza de diseño.

## Restricciones conocidas

- El **SDK está publicado en npm (0.1.1)** y su tipo público expone
  `answer: string | null`. Es la restricción dura de compatibilidad.
- La regla «`answer` nunca determina la decisión» es un cambio **semántico** de
  ruptura para cualquier integrador que hoy lea `answer` y decida con él. Añadir
  campos es compatible; cambiar lo que significan, no.
- Superficies afectadas: la tool MCP `human_query` (`src/mcp/server.ts`), el
  recurso REST (`src/routes/agent/queries.ts`), el SDK, la ruta de respuesta
  humana (`src/routes/human/queries.ts`) y el renderizado del email.

4. **El centro de validación vive fuera del agente.** Responde una sola pregunta
   —«¿puede esta query llegar a este humano, ahora?»— con dos clases de motivo:
   decidibilidad y economía de atención. Fuera del agente porque el agente es
   parte interesada, y como módulo propio porque las reglas necesitan estado que
   la petición no lleva: decisiones previas, presupuesto de interrupciones,
   confianza revocada.

5. **El riesgo lo declara el agente como suelo; el sistema lo eleva.** Nunca lo
   baja. Mismo principio que el delta: el sistema verifica con lo que ya sabe en
   vez de fiarse de lo que le cuentan.

6. **`insufficient_context` devuelve el turno sin cerrar la query.** El estado
   honesto más frecuente —«no sé de qué me hablas»— hoy se colapsa en un rechazo
   que bloquea o en un sí que no debería contar.

7. **Ruptura limpia.** No hay integradores externos todavía, así que la semántica
   cambia de una vez y el SDK sube de versión. Mantener semántica doble en la
   primitiva central por integradores hipotéticos se paga durante años.

8. **Se extiende el recurso `query` en su sitio**, en lugar de crear una primitiva
   `decision` aparte. Una segunda primitiva dejaría viva la débil, que es la que
   se acabaría usando por comodidad — reintroduciendo por la puerta de atrás la
   opción de «transporte con tipado opcional» que se rechazó en la decisión 1.

## Lo que queda por decidir

Qué se registra exactamente para que una decisión sea auditable *como informada*
(sección de atención y registro, sin presentar), las superficies a migrar y su
orden, y la estrategia de pruebas.

## Casos de uso — el conjunto de validación

Cuatro casos, elegidos porque **cada uno rompe algo que los otros no tocan**.
Son el criterio contra el que se juzga el diseño, y después la matriz de pruebas.

### 1. Renovación de contrato — decisión con estado previo

Un agente propone renovar un contrato de mantenimiento anual. Ya preguntó a esta
misma persona por este mismo asunto en marzo.

Ejercita: identidad estable del asunto, `changes` exigido **por detección del
sistema** y no por declaración del agente, consecuencia por rama, riesgo alto,
hash del artefacto en el momento de decidir.

Es el caso que justifica el proyecto entero: sin delta, el humano no sabe qué
cambió desde que dijo que sí, y su «sí» no significa nada.

### 2. Confirmación de extracción — ticket de restaurante

Un agente hace OCR de un ticket y necesita que un humano confirme o corrija lo
que ha leído: establecimiento, fecha, total, IVA, categoría.

Ejercita: `fields`, el adjunto como referente, valores **propuestos** por el
agente, riesgo bajo.

Es el caso que obligó a ampliar el catálogo. La pregunta real de un agente casi
nunca es «¿apruebas?», es «esto es lo que he entendido, corrígeme». Con `boolean`
haría falta un segundo viaje solo para averiguar *qué* estaba mal, y el valor
correcto se perdería en prosa.

Detalle que aclara el catálogo: aquí `text` como **tipo de campo** es legítimo —
el nombre del establecimiento es texto libre, no una decisión. La debilidad de
`text` importa cuando es el espacio de **la decisión**, no cuando es un dato.

### 3. Etiquetado — «¿esta foto es un gato?»

El caso más barato que existe.

Ejercita: que el **referente es obligatorio a cualquier riesgo**. La primera
versión de este diseño lo daba por opcional en riesgo bajo, y el ejemplo pasaba
la admisión sin la foto: una pregunta sobre una imagen, sin imagen.

### 4. Juicio sin artefacto — «¿desplegamos un viernes?»

No hay nada que mirar; es un juicio sobre política.

Ejercita: `self_contained: true`, la válvula de escape explícita a la regla del
referente.

## El catálogo, corregido

```ts
type AnswerSpace =
  | { kind: "boolean"; labels: {t,f}; consequences: {t,f} }
  | { kind: "choice";  options: Array<{id, label, consequence}>; select: "one"|"many" }
  | { kind: "scalar";  unit; min?, max?, step?; effect }
  | { kind: "date";    earliest?, latest?; effect }
  | { kind: "text";    maxLength }                       // débil; prohibido sobre `low`
  | { kind: "fields";  fields: Array<Slot & { proposed? }> }   // 1..N huecos de los tipos anteriores
```

`fields` **no** es JSON Schema libre: cada hueco es uno de los tipos cerrados, así
que sigue siendo comprobable y renderizable sin trabajo por caso. Y el temor que
me hizo descartarlo al principio —«complica la voz»— estaba mal planteado: el
problema de la voz nunca fue **componer** espacios cerrados, sino que fueran
**abiertos**. «He leído 41,90 €, ¿correcto?» se lee en voz alta sin dificultad.

## La regla del referente

Dos cosas distintas se habían mezclado bajo «ceremonia que escala con el riesgo»:

- **El referente** — ¿puede el humano percibir aquello sobre lo que se le
  pregunta? **No escala con el riesgo.** Sin él, la pregunta es incontestable
  valga 40.000 € o sea una foto de un gato.
- **El peso probatorio** — consecuencias por rama, hash de lo visto, delta contra
  la decisión anterior. **Sí escala.**

`subject` lleva siempre un referente: `uri`, `attachments` (que cuelgan del
mensaje `human_query` reutilizando `file_attachments`, sin maquinaria nueva) o
`body` en línea. Sin ninguno → `422 missing_referent`.

Corolario del argumento de auditoría: **no puedes hashear lo que no tienes.** Por
encima de `medium`, un `uri` externo a secas no basta — el referente tiene que ser
algo que AgentDialog posea, o el `sha256` es la palabra del agente y el registro
no es defendible.

## El principio que gobierna la autocertificación

`self_contained` lo declara el agente; el `risk` lo eleva el sistema. La
diferencia no es arbitraria:

**Se acepta autocertificación donde el bucle la castiga; se rechaza donde degrada
el registro en silencio.**

Un agente que miente con `self_contained: true` se lleva un
`insufficient_context` del humano y tiene que aportar el referente — se corrige
solo. Un agente que declara `risk: "low"` sobre una decisión de 40.000 € no lo
descubre nadie hasta la auditoría, y entonces ya no hay registro que valga.

## La forma de la query, en concreto

El caso 1, tal como lo enviaría un agente. Wire en snake_case, como el resto del
recurso:

```jsonc
POST /api/v1/agent/queries
{
  "risk": "high",
  "subject": {
    "id": "contrato-mantenimiento-cliente-a",        // estable: ya preguntó por esto en marzo
    "label": "Contrato de mantenimiento — Cliente A",
    "uri": "https://drive.../contrato-v4.pdf",
    "sha256": "9f2b1c…"                     // del PDF tal como el agente lo leyó
  },
  "question": "¿Renovamos por 12 meses en las nuevas condiciones?",
  "changes": [
    { "path": "Cláusula 7.2 — Precio",      "before": "38.400 €/año",
      "after": "41.900 €/año",               "materiality": "material" },
    { "path": "Cláusula 12 — Penalización",  "before": "2% mensual, tope 10%",
      "after": "4% mensual, sin tope",       "materiality": "material" },
    { "path": "Anexo II — Contacto",         "before": "J. Ruiz",
      "after": "M. Sanz",                    "materiality": "minor" }
  ],
  "answer_space": {
    "kind": "choice", "select": "one",
    "options": [
      { "id": "renew_12m",   "label": "Renovar 12 meses",
        "consequence": "Firmo y envío la aceptación hoy. Quedas comprometido a 41.900 €/año." },
      { "id": "renegotiate", "label": "Renegociar la cláusula 12",
        "consequence": "Devuelvo contrapropuesta sin tope. La renovación queda en suspenso." },
      { "id": "decline",     "label": "No renovar",
        "consequence": "Notifico no renovación. El servicio termina el 31/12." }
    ]
  },
  "target_human_email": "direccion@empresa.es",
  "timeout_minutes": 2880
}
```

Y lo que vuelve:

```jsonc
{ "status": "answered",
  "answer": { "kind": "choice", "option_ids": ["renegotiate"] },
  "comment": "El sin tope no pasa. Lo demás bien.",   // dato citado, no instrucción
  "decided_at": "…", "subject_sha256_at_decision": "9f2b1c…" }
```

`option_ids` es inequívoco. Hoy esto sería `answer: "sí pero cambia lo del IVA"`.

El caso 2 —el ticket— usa `fields` con el valor que el agente propone en cada
hueco, y vuelve con `values` corregidos por el humano. El agente sabe entonces
**exactamente** qué campo estaba mal y cuál es el bueno, en vez de recibir «el iva
está mal, son 24,13» y tener que interpretarlo.

## El centro de admisión

Un módulo en proceso, `src/admission/`, con `decidability.ts` y `attention.ts`
detrás de una interfaz. No un servicio: meter un salto de red en el camino crítico
de cada query, a esta escala, no compra nada. Lo que sí compra la frontera de
módulo es que las reglas dejen de estar dispersas por los handlers, que es donde
acabarían si no tienen casa. `query.service.ts` lo llama **antes** de abrir la
transacción: si no admite, no se crea nada.

### Qué exige, y cómo escala

| | `low` | `medium` | `high` | `critical` |
|---|---|---|---|---|
| Referente (o `self_contained`) | ✓ | ✓ | ✓ | ✓ |
| `answer_space` del catálogo | ✓ | ✓ | ✓ | ✓ |
| `text` como espacio de **decisión** | permitido | ✗ | ✗ | ✗ |
| Consecuencia por rama | — | ✓ | ✓ | ✓ |
| Referente **en posesión** de AgentDialog | — | — | ✓ | ✓ |
| `sha256` del referente | — | — | ✓ | ✓ |
| `changes` si hay decisión previa | mostrado | ✓ | ✓ | ✓ |

La última fila es la más cuidada. En `low` el sistema **no le exige el delta al
agente**, pero usa su propio historial para decirle al humano *«contestaste a esto
el 12 de marzo: sí»*. La memoria del humano se ayuda siempre; la obligación al
agente solo se impone donde la apuesta lo justifica.

### Elevación del riesgo: estrecha, pero inesquivable

Las señales mecánicas fiables son pocas, y conviene no fingir lo contrario:

- un campo `scalar` con unidad monetaria por encima de un umbral configurado →
  mínimo `high`;
- el asunto ya tiene una **decisión** previa → mínimo `medium`, porque es un
  cambio sobre algo ya acordado.

Inferir gravedad leyendo el texto de las consecuencias sería adivinar. **El valor
de la elevación no es que sea lista, es que no se puede esquivar.**

### La forma del rechazo

```jsonc
422 { "error": {
  "code": "UNDECIDABLE_QUERY",
  "reason": "prior_decision_without_delta",
  "detail": "Esta persona decidió sobre 'contrato-mantenimiento-cliente-a' el 2026-03-12.",
  "remedy": "Añade `changes` con lo que ha cambiado desde entonces.",
  "prior_query_id": "…" } }
```

`remedy` es deliberado: el receptor de este error es **un agente**, y un agente
solo puede corregir y reintentar si el error dice qué falta. Un `422` con «invalid
payload» obliga a que un humano lea documentación.

Códigos: `missing_referent`, `missing_answer_space`, `text_answer_above_low_risk`,
`missing_consequences`, `external_referent_at_high_risk`,
`prior_decision_without_delta`, `clarification_rounds_exhausted`.

## El ciclo de vida

> **Presentado, pendiente de visto bueno.** Las secciones anteriores están
> aprobadas; esta se presentó y la conversación se desvió antes de confirmarla.

Dos estados nuevos sobre los cuatro existentes:

```
pending ──┬─► assigned ──┬─► answered        (terminal)
          │      ▲       ├─► expired         (terminal)
          │      │       └─► cancelled       (terminal, lo pide el agente)
          └──────┼─► needs_context ──► assigned
                 └───────────┘
```

`needs_context` es el único que **devuelve el turno** en vez de cerrar.

Un solo endpoint con cuerpo discriminado, no dos rutas:

```jsonc
POST /api/v1/human/queries/:id/respond
{ "outcome": "answer", "answer": { "kind": "choice", "option_ids": ["renew_12m"] } }
// o
{ "outcome": "insufficient_context", "reason": "missing_delta", "note": "¿cambió el precio?" }
```

Motivos acotados: `unknown_subject`, `missing_delta`, `unclear_consequences`,
`referent_unreachable`, y **`not_my_decision`** — que no es falta de contexto pero
aparece constantemente en flujos reales y merece ser distinto, porque el remedio
es otro: no es «explícame más», es «pregunta a otra persona». Mezclarlo haría que
el agente reintentara explicándose mejor ante quien nunca va a decidir.

Tres detalles que deciden si esto funciona:

**El reloj se pausa.** En `needs_context` el turno es del agente, así que
`expires_at` se congela y se reanuda al volver a `assigned`. Sin esto una query se
muere mientras el agente la arregla, y el humano ve expirar algo que él mismo pidió
aclarar.

**El tope de rondas se aplica en la actualización, no con otro estado.** Dos
vueltas; la tercera se rechaza en la admisión. Preferimos un `422` a ampliar la
máquina de estados.

**`cancelled` pierde contra una respuesta ya emitida.** Si el humano contesta y el
cancel llega después, gana la respuesta y el agente recibe un `409`. Al revés
perderíamos la decisión de una persona por una carrera, y eso es justo lo que no
puede pasar en un sistema cuyo valor es el registro.

### Una pieza que se propone no construir

`superseded` —reemplazar una pregunta por su versión corregida— aparecía en el
análisis de partida. Con `needs_context` más actualización de la query, y
`cancelled` para el resto, **no le queda trabajo propio**: reemplazar es o aclarar
(cubierto) o cancelar y preguntar de nuevo (cubierto). Se deja fuera
explícitamente para que no vuelva por inercia.

## Dónde se quedó el diseño

- Secciones 1 (forma de la query) y 2 (centro de admisión): **aprobadas**.
- Sección 3 (ciclo de vida): presentada, pendiente de confirmación.
- Secciones 4 (política de atención y registro de decisión) y 5 (superficies,
  migración y pruebas): **sin presentar**.

El siguiente paso es confirmar la sección 3 y continuar por la 4.
