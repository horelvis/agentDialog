# Queries tipadas y centro de admisión — diseño

**Fecha:** 2026-08-21
**Estado:** aprobado, pendiente de plan de implementación
**Razonamiento:** `docs/superpowers/specs/2026-08-21-typed-queries-rationale.md`

El *porqué* vive en el documento de razonamiento, con los cuatro casos de uso que
son el criterio de aceptación. Este documento dice **qué construir**.

## Objetivo

Que una `human_query` sea decidible por construcción: que el humano sepa sobre qué
decide, qué provoca cada opción y qué ha cambiado desde la última vez, y que el
agente reciba una respuesta inequívoca en vez de prosa.

AgentDialog pasa de transportar preguntas a **garantizar que sean contestables**:
una query que no lo es se rechaza con `422`.

## Alcance

Dentro: el catálogo de respuestas, la forma de la pregunta, el centro de admisión,
y el ciclo de vida con `needs_context` y `cancelled`.

**Fuera, y a un spec posterior:** la política de atención (presupuesto de
interrupciones, franjas horarias, consolidación por expediente, quórum
multi-aprobador) y el registro de decisión (qué se renderizó, tiempo hasta
decidir). Ambos dependen de este trabajo y ninguno lo bloquea.

**Fuera, y deliberadamente no se construye:** `superseded`. Con `needs_context`
más actualización, y `cancelled` para el resto, no le queda trabajo propio —
reemplazar es o aclarar o cancelar y volver a preguntar. Se escribe aquí para que
no vuelva por inercia.

## 1. El catálogo de respuestas

Seis formas, propiedad del producto. El agente elige de la lista; no envía JSON
Schema arbitrario.

```ts
type AnswerSpace =
  | { kind: "boolean"; labels: { t: string; f: string };
      consequences?: { t: string; f: string } }
  | { kind: "choice"; select: "one" | "many";
      options: Array<{ id: string; label: string; consequence?: string }> }
  | { kind: "scalar"; unit: string; min?: number; max?: number; step?: number;
      effect?: string }
  | { kind: "date"; earliest?: string; latest?: string; effect?: string }
  | { kind: "text"; max_length: number }
  | { kind: "fields"; fields: Slot[]; effect?: string };

/** Un hueco de `fields`. Los mismos tipos, sin consecuencias: las consecuencias
 *  son de la decisión, y un hueco transporta un dato, no una decisión. */
type Slot = { id: string; label: string; proposed?: unknown } & (
  | { kind: "boolean"; labels: { t: string; f: string } }
  | { kind: "choice"; options: Array<{ id: string; label: string }> }
  | { kind: "scalar"; unit: string; min?: number; max?: number; step?: number }
  | { kind: "date"; earliest?: string; latest?: string }
  | { kind: "text"; max_length: number }
);
```

`fields` no anida: un `Slot` nunca es de tipo `fields`.

La consecuencia va **por rama** en los espacios discretos (`boolean`, `choice`),
porque el humano necesita saber qué provoca cada botón antes de pulsarlo, y como
un único `effect` en los continuos (`scalar`, `date`, `fields`), donde no hay ramas
que enumerar.

Son opcionales en el tipo y **obligatorias por encima de `low`**; la admisión lo
impone (§3).

### La respuesta

```ts
type Answer =
  | { kind: "boolean"; value: boolean }
  | { kind: "choice";  option_ids: string[] }      // SIEMPRE array, incluso con select "one"
  | { kind: "scalar";  value: number }
  | { kind: "date";    value: string }             // ISO 8601, solo fecha
  | { kind: "text";    value: string }
  | { kind: "fields";  values: Record<string, unknown> };
```

Se valida contra el `answer_space` de su query: `option_ids` deben existir,
`scalar` debe caer en `[min,max]` y respetar `step`, `fields.values` debe cubrir
exactamente los `id` declarados.

`comment` sobrevive como campo aparte, opcional, máximo 32.000 caracteres, y viaja
**etiquetado como dato citado**. Nunca se concatena como instrucción en el contexto
del agente.

### La regla de `text`

`kind: "text"` como espacio de decisión se rechaza por encima de `low`. Un `Slot`
de tipo `text` dentro de `fields` se permite a cualquier riesgo, porque transporta
un dato y no la decisión — el nombre de un establecimiento es texto libre.

Para que eso no sea un rodeo: por encima de `low`, un `fields` debe contener **al
menos un `Slot` que no sea `text`**. Un `fields` con un único hueco de texto es un
espacio de decisión abierto con otro nombre.

## 2. La forma de la pregunta

```jsonc
{
  "risk": "low" | "medium" | "high" | "critical",
  "subject": {
    "id": "string, 1..128, opaco para nosotros",
    "label": "string, 1..200, legible por un humano",
    "uri": "string opcional",
    "attachments": ["file_id"],        // adjuntos del mensaje human_query
    "body": "texto en línea opcional",
    "sha256": "hex opcional, del referente tal como lo vio el agente"
  },
  "self_contained": false,
  "question": "string, 1..10 000",
  "context": "string opcional, ..100 000",       // apoyo, ya no sostiene la decisión
  "changes": [
    { "path": "string", "before": "string", "after": "string",
      "materiality": "minor" | "material" }
  ],
  "answer_space": { ... },
  "target_human_email": "email",
  "timeout_minutes": 1..10080
}
```

**`subject.id` tiene alcance por agente.** La detección de decisión previa busca
por `(agent_id, target_human_email, subject.id)`. El `contrato-x` del agente A no
es el del agente B.

**`materiality` es solo presentación**: destaca los cambios relevantes frente al
ruido. No eleva el riesgo — inferir gravedad de un texto sería adivinar.

`query_type` se conserva y **queda degradado a presentación**: enmarca la petición
(«se requiere tu opinión experta» frente a «confirma esto»). No valida nada.

## 3. El centro de admisión

Módulo en proceso, `src/admission/decidability.ts`, detrás de una interfaz.
`query.service.ts` lo llama **antes** de abrir la transacción: si no admite, no se
crea nada. No es un servicio: un salto de red en el camino crítico de cada query no
compra nada a esta escala, y la frontera de módulo es lo que evita que las reglas
se dispersen por los handlers.

### Requisitos por nivel

| | `low` | `medium` | `high` | `critical` |
|---|---|---|---|---|
| Referente, o `self_contained: true` | ✓ | ✓ | ✓ | ✓ |
| `answer_space` del catálogo | ✓ | ✓ | ✓ | ✓ |
| `text` como espacio de decisión | permitido | ✗ | ✗ | ✗ |
| `fields` con al menos un hueco no-`text` | — | ✓ | ✓ | ✓ |
| Consecuencia por rama / `effect` | — | ✓ | ✓ | ✓ |
| Referente en posesión de AgentDialog | — | — | ✓ | ✓ |
| `sha256` del referente | — | — | ✓ | ✓ |
| `changes` si hay decisión previa | mostrado | ✓ | ✓ | ✓ |

«Referente» es al menos uno de `uri`, `attachments` o `body`. «En posesión»
significa `attachments` o `body`: **no se puede hashear lo que no se tiene**, y un
`sha256` sobre un enlace ajeno es la palabra del agente.

La última fila es deliberada: en `low` el sistema **no exige el delta al agente**,
pero usa su propio historial para mostrarle al humano *«contestaste a esto el 12 de
marzo: sí»*. La memoria del humano se ayuda siempre; la obligación al agente solo
se impone donde la apuesta lo justifica.

### Elevación del riesgo

El agente declara un suelo; el sistema lo eleva y **nunca lo baja**. Dos señales,
ambas mecánicas:

- un `Slot` o `answer_space` de tipo `scalar` cuya `unit` sea una divisa ISO 4217
  y cuyo `max` (o `proposed`, si no hay `max`) supere `RISK_ELEVATION_AMOUNT`
  → mínimo `high`. Variable de entorno, sin conversión de divisa: se compara el
  número tal cual, y el defecto es `1000`. Comparar euros con yenes sin tabla de
  cambios sería peor que no comparar, así que el umbral es deliberadamente burdo
  y su trabajo es levantar el suelo, no medir;
- el asunto ya tiene una decisión previa de este humano → mínimo `medium`.

**«Decisión previa» significa una query en estado `answered`** sobre el mismo
`(agent_id, target_human_email, subject.id)`. Una query `expired`, `cancelled` o
en curso no cuenta: nadie decidió nada, así que no hay memoria que contradecir ni
delta que explicar.

Son pocas a propósito. El valor de la elevación no es que sea lista, es que no se
puede esquivar.

### El rechazo

```jsonc
422 {
  "error": {
    "code": "UNDECIDABLE_QUERY",
    "reason": "prior_decision_without_delta",
    "detail": "Esta persona decidió sobre 'contrato-mantenimiento-cliente-a' el 2026-03-12.",
    "remedy": "Añade `changes` con lo que ha cambiado desde entonces.",
    "prior_query_id": "uuid"
  }
}
```

`remedy` no es cortesía: quien recibe este error es **un agente**, y solo puede
corregirse y reintentar si el error dice qué falta.

Códigos de `reason`: `missing_referent`, `missing_answer_space`,
`text_answer_above_low_risk`, `fields_all_text_above_low_risk`,
`missing_consequences`, `external_referent_at_high_risk`,
`prior_decision_without_delta`, `clarification_rounds_exhausted`.

## 4. El ciclo de vida

```
pending ──┬─► assigned ───────┬─► answered     (terminal)
          │     ▲   │         ├─► expired      (terminal)
          │     │   ▼         └─► cancelled    (terminal, lo pide el agente)
          └─► needs_context ──┴─► expired / cancelled
                    │
                    └─► assigned   (PATCH del agente)
```

`answered`, `expired` y `cancelled` son alcanzables desde `pending`, `assigned` y
`needs_context`. Solo `answered` exige haber pasado por `assigned`.

`needs_context` es el único estado que **devuelve el turno** en vez de cerrar.

### La respuesta del humano

Un endpoint, cuerpo discriminado:

```jsonc
POST /api/v1/human/queries/:id/respond
{ "outcome": "answer", "answer": { "kind": "choice", "option_ids": ["renew_12m"] },
  "comment": "opcional" }

{ "outcome": "insufficient_context", "reason": "missing_delta", "note": "opcional" }
```

Motivos: `unknown_subject`, `missing_delta`, `unclear_consequences`,
`referent_unreachable`, `not_my_decision`.

`not_my_decision` es distinto de los demás a propósito: no es falta de contexto, y
su remedio no es explicarse mejor sino preguntar a otra persona. Mezclarlo haría
que el agente reintentara ante quien nunca va a decidir.

### La actualización del agente

```
PATCH /api/v1/agent/queries/:id
```

Acepta `subject`, `changes`, `answer_space`, `question`, `context`. Pasa por la
admisión igual que la creación. Solo es válido desde `needs_context`; desde
cualquier otro estado, `409`.

### El reloj

Al entrar en `needs_context` se sella `paused_at`. Al volver a `assigned`,
`expires_at += (now - paused_at)` y `paused_at = null`. Sin esto, una query se
muere mientras el agente la arregla y el humano ve expirar algo que él mismo pidió
aclarar.

**La pausa solo aplica mientras el agente puede actuar.** Con
`clarification_rounds >= 2` el `PATCH` se rechaza, así que la pausa no se aplica y
la query expira con normalidad. Sin esta regla quedaría congelada para siempre.

### El tope de rondas

`clarification_rounds` se incrementa al entrar en `needs_context`. Con el
contador en 2, el `PATCH` devuelve `422 clarification_rounds_exhausted` — crea una
query nueva. Se aplica en la actualización en vez de añadir un estado terminal más.

### La carrera del cancel

```
POST /api/v1/agent/queries/:id/cancel
```

Actualización condicional sobre `status IN ('pending','assigned','needs_context')`.
Si afecta a cero filas, `409` con el estado actual. **Una respuesta ya emitida gana
siempre**: perder la decisión de una persona por una carrera es exactamente lo que
no puede pasar en un sistema cuyo valor es el registro.

## 5. Esquema y migración

`human_queries` gana:

| Columna | Tipo | Notas |
|---|---|---|
| `risk` | enum | `low\|medium\|high\|critical`, no nulo, defecto `low` |
| `subject` | jsonb | no nulo |
| `self_contained` | boolean | no nulo, defecto `false` |
| `changes` | jsonb | anulable |
| `answer_space` | jsonb | no nulo |
| `answer` | jsonb | **cambia de `text` a `jsonb`** |
| `clarification_rounds` | integer | no nulo, defecto 0 |
| `paused_at` | timestamptz | anulable |
| `insufficient_reason` | varchar | anulable |

`query_status` gana `needs_context` y `cancelled`.

**Filas existentes.** Se migran, no se descartan: `answer_space` a
`{"kind":"text","max_length":32000}`, `risk` a `low`, `self_contained` a `true`,
`subject` a `{"id":"legacy:<query_id>","label":<primeros 80 caracteres de question>}`,
y `answer` de texto a `{"kind":"text","value":<texto>}`. El histórico se sigue
leyendo y el propio dato deja constancia de que se decidió en el régimen antiguo.
Descartarlo sería perder el registro que todo esto pretende proteger.

## 6. Superficies

| Fichero | Cambio |
|---|---|
| `src/db/schema/human-queries.ts`, `enums.ts` | columnas y estados; migración Drizzle |
| `src/validators/query.validators.ts` | `createQuerySchema`, `respondQuerySchema`, `patchQuerySchema` |
| `src/admission/decidability.ts` | nuevo |
| `src/services/query.service.ts` | admisión, `PATCH`, `cancel`, reloj, rondas |
| `src/routes/agent/queries.ts` | `422` con `remedy`; `PATCH`; `cancel` |
| `src/routes/human/queries.ts` | cuerpo discriminado |
| `src/mcp/server.ts` | el esquema de la tool `human_query` |
| `sdks/typescript/` | tipos, subida de versión, README y docs en el mismo cambio |
| `web/` | render de las seis formas, con valores propuestos en `fields` |
| `src/services/query-email.service.ts` | el aviso muestra asunto y resumen de cambios |

`web/` es el bloque más grande y el más fácil de subestimar.

Orden de despliegue: el esquema y la API antes que el SDK, y el SDK antes de
anunciar nada — la regla del repositorio de que tocar el SDK obliga a actualizar
sus docs, la landing y el README se aplica igual.

## 7. Criterios de aceptación

Los cuatro casos de uso del documento de razonamiento, más las reglas del ciclo:

1. **Renovación de contrato.** Segunda pregunta sobre el mismo asunto sin
   `changes` → `422 prior_decision_without_delta`. Con `changes` → admitida, y el
   humano ve el delta y la fecha de su decisión anterior.
2. **Ticket de restaurante.** `fields` con valores propuestos; el humano corrige
   uno; el agente recibe `values` completo con la corrección.
3. **Etiquetado sin imagen.** `subject` sin `uri`, `attachments` ni `body`, y sin
   `self_contained` → `422 missing_referent`, a cualquier riesgo.
4. **Juicio sin artefacto.** `self_contained: true` sin referente → admitida.
5. Un `answer_space` de tipo `text` con `risk: "high"` → `422`.
6. Un `fields` cuyos huecos son todos `text` con `risk: "high"` → `422`.
7. `insufficient_context` deja la query en `needs_context`, congela `expires_at` y
   no la cierra; el `PATCH` del agente la devuelve a `assigned` con el reloj
   reanudado.
8. Un tercer `PATCH` → `422 clarification_rounds_exhausted`, y la query deja de
   estar pausada.
9. `cancel` sobre una query ya contestada → `409`, y la respuesta permanece.
10. Una query creada antes de la migración se sigue leyendo, con
    `answer_space.kind = "text"`.

## 8. Pruebas

**Unitarias, sin base de datos** — las reglas de decidibilidad que solo miran el
payload: referente ausente, `text` sobre `low`, `fields` todo texto, consecuencias
que faltan, referente externo en `high`, validación de una respuesta contra su
`answer_space`. Es la mayor parte de la admisión y es hermética.

**Integración** — detección de decisión previa (necesita historial), pausa y
reanudación del reloj, tope de rondas, y la carrera de `cancel`.

**Contrato del SDK** — que los tipos publicados reflejan el `answer` estructurado,
en el `smoke-pack` que ya existe.

No hay test de la UI en este spec; el render de las seis formas se verifica a mano
durante la implementación y queda anotado como deuda declarada.
