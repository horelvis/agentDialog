# Queries tipadas y centro de admisión — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una `human_query` sea decidible por construcción — espacio de respuesta cerrado, referente obligatorio, consecuencias, delta exigido por el sistema — y que lo indecidible se rechace con `422`.

**Architecture:** Dos módulos puros nuevos (`src/lib/answer-space.ts` y `src/admission/decidability.ts`) que no tocan base de datos y concentran casi toda la lógica, más las reglas que sí necesitan historial en el servicio. `query.service.ts` llama a la admisión antes de abrir la transacción: si no admite, no se crea nada. El ciclo de vida gana `needs_context` (que devuelve el turno al agente) y `cancelled`.

**Tech Stack:** Bun, Hono, Drizzle, zod, `bun test`, React 19 + Vite en `web/`.

**Spec:** `docs/superpowers/specs/2026-08-21-typed-queries-design.md`
**Razonamiento:** `docs/superpowers/specs/2026-08-21-typed-queries-rationale.md`

## Global Constraints

- **Ruptura limpia.** No hay integradores externos. No se mantiene compatibilidad con el `answer` en prosa salvo para **leer** filas migradas.
- El catálogo de respuestas lo posee el producto: seis formas y ninguna más. **Nunca** JSON Schema arbitrario del agente.
- **`fields` no anida**: un `Slot` nunca es de tipo `fields`.
- `text` como espacio de decisión se rechaza por encima de `low`. Un `Slot` de tipo `text` dentro de `fields` se permite a cualquier riesgo. Por encima de `low`, un `fields` debe tener al menos un `Slot` que no sea `text`.
- El riesgo que declara el agente es un **suelo**. El sistema lo eleva y **nunca lo baja**.
- «Decisión previa» significa una query en estado **`answered`** sobre el mismo `(agent_id, target_human_email, subject.id)`. `expired` y `cancelled` no cuentan.
- `answer.option_ids` es **siempre un array**, incluso con `select: "one"`.
- Wire en **snake_case**; la superficie del SDK en **camelCase**, traduciendo en `sdks/typescript/src/queries.ts`.
- Todas las rutas de agente responden `{ data: ... }`. Los errores, `{ error: { code, message, ... } }`.
- Código, comentarios y mensajes de commit **en inglés**. Los documentos del repositorio, en español; sigue el idioma del fichero que edites.
- **Los ejemplos usan clientes ficticios.** Nunca un cliente real: es un repositorio público.
- `bunx tsc --noEmit` debe salir con 0. Antes de la suite, `docker exec agentdialog_redis_1 redis-cli -n 1 FLUSHDB` — sin eso, el límite de 10 registros/hora en Redis produce `429` falsos.
- `tests/unit/` no puede tocar PostgreSQL, Redis ni la red.
- Tocar el SDK obliga a actualizar `docs-site`, los ejemplos de la landing y el README del SDK **en el mismo cambio**.
- Trabaja en una rama a partir de `typed-queries-rationale`, que ya contiene el spec.

## Nota de tamaño

Once tareas. Las 1-9 son backend y dejan la API completa y verde; la 10 es el SDK y sus documentos; la 11 es `web/`, el bloque más grande y el más fácil de subestimar. **La 11 no es opcional**: al cambiar la API, la UI actual deja de funcionar, así que backend y UI se despliegan juntos.

---

### Task 1: El catálogo de respuestas y la validación de una respuesta

Módulo puro, sin base de datos. Es la base que consumen la admisión, el servicio y la UI.

**Files:**
- Create: `src/lib/answer-space.ts`
- Create: `tests/unit/answer-space.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type AnswerSpace`, `type Slot`, `type Answer` (formas del spec §1)
  - `answerSpaceSchema: z.ZodType<AnswerSpace>`
  - `answerSchema: z.ZodType<Answer>`
  - `validateAnswerAgainstSpace(space: AnswerSpace, answer: Answer): { ok: true } | { ok: false; problem: string }`
  - `isDiscrete(space: AnswerSpace): boolean`
  - `hasNonTextSlot(space: AnswerSpace): boolean`
  - Las tareas 2, 4, 6 y 10 dependen de estos nombres exactos.

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/unit/answer-space.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
  answerSpaceSchema,
  validateAnswerAgainstSpace,
  isDiscrete,
  hasNonTextSlot,
  type AnswerSpace,
} from "../../src/lib/answer-space";

/**
 * The catalogue is the product's, not the agent's. Anything outside these six
 * shapes is rejected at the edge, which is what makes the admission guarantee
 * checkable at all.
 */

const choice: AnswerSpace = {
  kind: "choice",
  select: "one",
  options: [
    { id: "renew", label: "Renovar", consequence: "Firmo hoy." },
    { id: "decline", label: "No renovar", consequence: "Notifico la no renovación." },
  ],
};

describe("answerSpaceSchema", () => {
  it("accepts each of the six shapes", () => {
    const shapes: AnswerSpace[] = [
      { kind: "boolean", labels: { t: "Sí", f: "No" } },
      choice,
      { kind: "scalar", unit: "EUR", min: 0, max: 1000 },
      { kind: "date" },
      { kind: "text", max_length: 500 },
      { kind: "fields", fields: [{ id: "total", label: "Total", kind: "scalar", unit: "EUR" }] },
    ];
    for (const s of shapes) {
      expect(answerSpaceSchema.safeParse(s).success).toBe(true);
    }
  });

  it("rejects a kind outside the catalogue", () => {
    expect(answerSpaceSchema.safeParse({ kind: "json_schema", schema: {} }).success).toBe(false);
  });

  // Nesting would reopen the arbitrary-shape door the catalogue exists to close.
  it("rejects a fields slot that is itself fields", () => {
    const nested = {
      kind: "fields",
      fields: [{ id: "inner", label: "Inner", kind: "fields", fields: [] }],
    };
    expect(answerSpaceSchema.safeParse(nested).success).toBe(false);
  });

  it("rejects a choice with no options", () => {
    expect(answerSpaceSchema.safeParse({ kind: "choice", select: "one", options: [] }).success).toBe(false);
  });

  it("rejects duplicate option ids", () => {
    const dup = {
      kind: "choice", select: "one",
      options: [{ id: "a", label: "A" }, { id: "a", label: "Otra A" }],
    };
    expect(answerSpaceSchema.safeParse(dup).success).toBe(false);
  });

  it("rejects duplicate field ids", () => {
    const dup = {
      kind: "fields",
      fields: [
        { id: "x", label: "X", kind: "text", max_length: 10 },
        { id: "x", label: "Otra X", kind: "text", max_length: 10 },
      ],
    };
    expect(answerSpaceSchema.safeParse(dup).success).toBe(false);
  });
});

describe("isDiscrete", () => {
  it("is true for boolean and choice, false for the rest", () => {
    expect(isDiscrete({ kind: "boolean", labels: { t: "S", f: "N" } })).toBe(true);
    expect(isDiscrete(choice)).toBe(true);
    expect(isDiscrete({ kind: "scalar", unit: "EUR" })).toBe(false);
    expect(isDiscrete({ kind: "date" })).toBe(false);
    expect(isDiscrete({ kind: "text", max_length: 10 })).toBe(false);
    expect(isDiscrete({ kind: "fields", fields: [] })).toBe(false);
  });
});

describe("hasNonTextSlot", () => {
  it("is false for a fields made only of text slots", () => {
    const allText: AnswerSpace = {
      kind: "fields",
      fields: [{ id: "a", label: "A", kind: "text", max_length: 10 }],
    };
    expect(hasNonTextSlot(allText)).toBe(false);
  });

  it("is true as soon as one slot is not text", () => {
    const mixed: AnswerSpace = {
      kind: "fields",
      fields: [
        { id: "a", label: "A", kind: "text", max_length: 10 },
        { id: "b", label: "B", kind: "date" },
      ],
    };
    expect(hasNonTextSlot(mixed)).toBe(true);
  });

  it("is true for any non-fields space", () => {
    expect(hasNonTextSlot(choice)).toBe(true);
  });
});

describe("validateAnswerAgainstSpace", () => {
  it("accepts a choice answer naming a declared option", () => {
    expect(validateAnswerAgainstSpace(choice, { kind: "choice", option_ids: ["renew"] }))
      .toEqual({ ok: true });
  });

  it("rejects an option id that was never offered", () => {
    const r = validateAnswerAgainstSpace(choice, { kind: "choice", option_ids: ["inventado"] });
    expect(r.ok).toBe(false);
  });

  it("rejects more than one option when select is one", () => {
    const r = validateAnswerAgainstSpace(choice, { kind: "choice", option_ids: ["renew", "decline"] });
    expect(r.ok).toBe(false);
  });

  it("accepts several options when select is many", () => {
    const many: AnswerSpace = { ...choice, select: "many" };
    expect(validateAnswerAgainstSpace(many, { kind: "choice", option_ids: ["renew", "decline"] }))
      .toEqual({ ok: true });
  });

  it("rejects an answer whose kind does not match the space", () => {
    const r = validateAnswerAgainstSpace(choice, { kind: "boolean", value: true });
    expect(r.ok).toBe(false);
  });

  it("rejects a scalar outside its range", () => {
    const space: AnswerSpace = { kind: "scalar", unit: "EUR", min: 0, max: 100 };
    expect(validateAnswerAgainstSpace(space, { kind: "scalar", value: 50 })).toEqual({ ok: true });
    expect(validateAnswerAgainstSpace(space, { kind: "scalar", value: 101 }).ok).toBe(false);
    expect(validateAnswerAgainstSpace(space, { kind: "scalar", value: -1 }).ok).toBe(false);
  });

  it("rejects a scalar that does not respect step", () => {
    const space: AnswerSpace = { kind: "scalar", unit: "EUR", min: 0, max: 10, step: 0.5 };
    expect(validateAnswerAgainstSpace(space, { kind: "scalar", value: 2.5 })).toEqual({ ok: true });
    expect(validateAnswerAgainstSpace(space, { kind: "scalar", value: 2.3 }).ok).toBe(false);
  });

  it("rejects a date outside its window and a malformed one", () => {
    const space: AnswerSpace = { kind: "date", earliest: "2026-01-01", latest: "2026-12-31" };
    expect(validateAnswerAgainstSpace(space, { kind: "date", value: "2026-06-01" })).toEqual({ ok: true });
    expect(validateAnswerAgainstSpace(space, { kind: "date", value: "2025-12-31" }).ok).toBe(false);
    expect(validateAnswerAgainstSpace(space, { kind: "date", value: "no es fecha" }).ok).toBe(false);
  });

  it("rejects text longer than max_length", () => {
    const space: AnswerSpace = { kind: "text", max_length: 5 };
    expect(validateAnswerAgainstSpace(space, { kind: "text", value: "corto" })).toEqual({ ok: true });
    expect(validateAnswerAgainstSpace(space, { kind: "text", value: "demasiado largo" }).ok).toBe(false);
  });

  // The receipt case: every declared slot must come back, and nothing else.
  it("requires fields values to cover exactly the declared slots", () => {
    const space: AnswerSpace = {
      kind: "fields",
      fields: [
        { id: "total", label: "Total", kind: "scalar", unit: "EUR" },
        { id: "merchant", label: "Establecimiento", kind: "text", max_length: 100 },
      ],
    };
    expect(validateAnswerAgainstSpace(space, {
      kind: "fields", values: { total: 138.4, merchant: "La Tasquita" },
    })).toEqual({ ok: true });

    expect(validateAnswerAgainstSpace(space, {
      kind: "fields", values: { total: 138.4 },
    }).ok).toBe(false);

    expect(validateAnswerAgainstSpace(space, {
      kind: "fields", values: { total: 138.4, merchant: "X", sobra: 1 },
    }).ok).toBe(false);
  });

  it("validates each fields value against its own slot type", () => {
    const space: AnswerSpace = {
      kind: "fields",
      fields: [{ id: "total", label: "Total", kind: "scalar", unit: "EUR", min: 0, max: 100 }],
    };
    expect(validateAnswerAgainstSpace(space, { kind: "fields", values: { total: 200 } }).ok).toBe(false);
    expect(validateAnswerAgainstSpace(space, { kind: "fields", values: { total: "no es número" } }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Run: `bun test tests/unit/answer-space.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/answer-space'`

- [ ] **Step 3: Escribir la implementación**

Crea `src/lib/answer-space.ts`:

```ts
import { z } from "zod";

/**
 * The catalogue of answer shapes. It belongs to the product, not to the agent:
 * an agent picks from this list and never sends an arbitrary JSON Schema.
 *
 * That is what makes the admission guarantee checkable. You cannot verify that
 * an arbitrary schema is answerable by a human, and you cannot render one in an
 * email or read it aloud over a phone line. A closed catalogue you can.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const booleanSpace = z.object({
  kind: z.literal("boolean"),
  labels: z.object({ t: z.string().min(1), f: z.string().min(1) }),
  consequences: z.object({ t: z.string().min(1), f: z.string().min(1) }).optional(),
});

const choiceOption = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
  consequence: z.string().min(1).max(500).optional(),
});

const choiceSpace = z.object({
  kind: z.literal("choice"),
  select: z.enum(["one", "many"]),
  options: z.array(choiceOption).min(1).max(20),
}).refine(
  (s) => new Set(s.options.map((o) => o.id)).size === s.options.length,
  { message: "option ids must be unique" },
);

const scalarSpace = z.object({
  kind: z.literal("scalar"),
  unit: z.string().min(1).max(16),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
  effect: z.string().min(1).max(500).optional(),
});

const dateSpace = z.object({
  kind: z.literal("date"),
  earliest: z.string().regex(ISO_DATE).optional(),
  latest: z.string().regex(ISO_DATE).optional(),
  effect: z.string().min(1).max(500).optional(),
});

const textSpace = z.object({
  kind: z.literal("text"),
  max_length: z.number().int().min(1).max(32_000),
});

/**
 * A slot carries a datum, not a decision, so it has no consequences of its own
 * and `fields` never nests. A nested fields would be an arbitrary tree, which is
 * the door this catalogue exists to close.
 */
const slot = z.intersection(
  z.object({
    id: z.string().min(1).max(64),
    label: z.string().min(1).max(200),
    proposed: z.unknown().optional(),
  }),
  z.discriminatedUnion("kind", [
    booleanSpace.omit({ consequences: true }),
    choiceSpace.innerType().omit({ select: true }),
    scalarSpace.omit({ effect: true }),
    dateSpace.omit({ effect: true }),
    textSpace,
  ]),
);

const fieldsSpace = z.object({
  kind: z.literal("fields"),
  fields: z.array(slot).min(1).max(20),
  effect: z.string().min(1).max(500).optional(),
}).refine(
  (s) => new Set(s.fields.map((f) => f.id)).size === s.fields.length,
  { message: "field ids must be unique" },
);

export const answerSpaceSchema = z.union([
  booleanSpace, choiceSpace, scalarSpace, dateSpace, textSpace, fieldsSpace,
]);

export type AnswerSpace = z.infer<typeof answerSpaceSchema>;
export type Slot = z.infer<typeof slot>;

export const answerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("boolean"), value: z.boolean() }),
  z.object({ kind: z.literal("choice"), option_ids: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal("scalar"), value: z.number() }),
  z.object({ kind: z.literal("date"), value: z.string() }),
  z.object({ kind: z.literal("text"), value: z.string() }),
  z.object({ kind: z.literal("fields"), values: z.record(z.unknown()) }),
]);

export type Answer = z.infer<typeof answerSchema>;

/** Discrete spaces enumerate branches, so their consequences go per branch. */
export function isDiscrete(space: AnswerSpace): boolean {
  return space.kind === "boolean" || space.kind === "choice";
}

/**
 * A `fields` whose slots are all text is an open decision space wearing another
 * name, so above `low` risk it is refused. Everything else has a shape.
 */
export function hasNonTextSlot(space: AnswerSpace): boolean {
  if (space.kind !== "fields") return true;
  return space.fields.some((f) => f.kind !== "text");
}

type Check = { ok: true } | { ok: false; problem: string };
const bad = (problem: string): Check => ({ ok: false, problem });

function checkSlotValue(slotDef: Slot, value: unknown): Check {
  switch (slotDef.kind) {
    case "boolean":
      return typeof value === "boolean" ? { ok: true } : bad(`${slotDef.id}: expected a boolean`);
    case "choice": {
      const ids = slotDef.options.map((o) => o.id);
      return typeof value === "string" && ids.includes(value)
        ? { ok: true }
        : bad(`${slotDef.id}: expected one of ${ids.join(", ")}`);
    }
    case "scalar":
      return checkScalar(slotDef, value, slotDef.id);
    case "date":
      return checkDate(slotDef, value, slotDef.id);
    case "text":
      return typeof value === "string" && value.length <= slotDef.max_length
        ? { ok: true }
        : bad(`${slotDef.id}: expected text of at most ${slotDef.max_length} characters`);
  }
}

function checkScalar(
  def: { min?: number; max?: number; step?: number },
  value: unknown,
  where: string,
): Check {
  if (typeof value !== "number" || !Number.isFinite(value)) return bad(`${where}: expected a number`);
  if (def.min !== undefined && value < def.min) return bad(`${where}: below the minimum ${def.min}`);
  if (def.max !== undefined && value > def.max) return bad(`${where}: above the maximum ${def.max}`);
  if (def.step !== undefined) {
    const base = def.min ?? 0;
    const steps = (value - base) / def.step;
    // Floating point: 2.5 / 0.5 is not exactly 5 on every input.
    if (Math.abs(steps - Math.round(steps)) > 1e-9) {
      return bad(`${where}: not a multiple of the step ${def.step}`);
    }
  }
  return { ok: true };
}

function checkDate(
  def: { earliest?: string; latest?: string },
  value: unknown,
  where: string,
): Check {
  if (typeof value !== "string" || !ISO_DATE.test(value)) {
    return bad(`${where}: expected a date as YYYY-MM-DD`);
  }
  if (Number.isNaN(Date.parse(value))) return bad(`${where}: not a real date`);
  if (def.earliest && value < def.earliest) return bad(`${where}: earlier than ${def.earliest}`);
  if (def.latest && value > def.latest) return bad(`${where}: later than ${def.latest}`);
  return { ok: true };
}

/**
 * The answer must fit the space its query declared. This is what replaces
 * "the agent reads the prose and works out what the human meant".
 */
export function validateAnswerAgainstSpace(space: AnswerSpace, answer: Answer): Check {
  if (space.kind !== answer.kind) {
    return bad(`answer is ${answer.kind} but the query asks for ${space.kind}`);
  }

  switch (space.kind) {
    case "boolean":
      return { ok: true }; // the schema already narrowed value to a boolean

    case "choice": {
      const offered = new Set(space.options.map((o) => o.id));
      const chosen = (answer as { option_ids: string[] }).option_ids;
      if (space.select === "one" && chosen.length !== 1) {
        return bad("this query accepts exactly one option");
      }
      if (new Set(chosen).size !== chosen.length) return bad("repeated option ids");
      for (const id of chosen) {
        if (!offered.has(id)) return bad(`option '${id}' was never offered`);
      }
      return { ok: true };
    }

    case "scalar":
      return checkScalar(space, (answer as { value: number }).value, "answer");

    case "date":
      return checkDate(space, (answer as { value: string }).value, "answer");

    case "text": {
      const v = (answer as { value: string }).value;
      return v.length <= space.max_length
        ? { ok: true }
        : bad(`answer is longer than the ${space.max_length} characters allowed`);
    }

    case "fields": {
      const values = (answer as { values: Record<string, unknown> }).values;
      const declared = new Set(space.fields.map((f) => f.id));
      const given = new Set(Object.keys(values));
      for (const id of declared) if (!given.has(id)) return bad(`missing value for '${id}'`);
      for (const id of given) if (!declared.has(id)) return bad(`unexpected value '${id}'`);
      for (const f of space.fields) {
        const r = checkSlotValue(f, values[f.id]);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
  }
}
```

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

Run: `bun test tests/unit/answer-space.test.ts`
Expected: PASS

Si el `slot` con `z.intersection` da problemas de inferencia en `checkSlotValue`, sustitúyelo por un `z.discriminatedUnion` de cinco objetos que ya incluyan `id`, `label` y `proposed` en cada rama. Es más verboso y equivalente; no lo fuerces con `as any`.

- [ ] **Step 5: Typecheck y commit**

Run: `bunx tsc --noEmit`
Expected: exit 0

```bash
git add src/lib/answer-space.ts tests/unit/answer-space.test.ts
git commit -m "Add the closed catalogue of answer shapes

The product owns the taxonomy: six shapes, and an agent picks from the list
rather than sending an arbitrary JSON Schema. That is what makes the
admission guarantee checkable at all - you cannot verify that an arbitrary
schema is answerable by a human, nor render one in an email.

Also validates an answer against the space its query declared, which is what
replaces the agent reading prose and guessing what the human meant."
```

---

### Task 2: Las reglas de decidibilidad que solo miran el payload

Módulo puro, sin base de datos ni historial. Es la mayor parte de la admisión.

**Files:**
- Create: `src/admission/decidability.ts`
- Create: `tests/unit/decidability.test.ts`

**Interfaces:**
- Consumes: `AnswerSpace`, `hasNonTextSlot`, `isDiscrete` (Task 1).
- Produces:
  - `type Risk = "low" | "medium" | "high" | "critical"`
  - `type Subject = { id: string; label: string; uri?: string; attachments?: string[]; body?: string; sha256?: string }`
  - `type AdmissionInput = { risk: Risk; subject: Subject; self_contained?: boolean; answer_space: AnswerSpace }`
  - `type AdmissionVerdict = { admit: true } | { admit: false; reason: AdmissionReason; detail: string; remedy: string }`
  - `type AdmissionReason` — la unión de los siete códigos
  - `checkPayload(input: AdmissionInput): AdmissionVerdict`
  - `atLeast(a: Risk, b: Risk): Risk` y `RISK_ORDER: Risk[]`
  - Las tareas 4 y 5 dependen de estos nombres.

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/unit/decidability.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { checkPayload, atLeast, type AdmissionInput } from "../../src/admission/decidability";
import type { AnswerSpace } from "../../src/lib/answer-space";

/**
 * The rules that need no history live here and are pure. What the system
 * refuses is not a malformed payload - zod already did that - but a question a
 * human could not answer.
 */

const choice: AnswerSpace = {
  kind: "choice", select: "one",
  options: [
    { id: "yes", label: "Sí", consequence: "Firmo hoy." },
    { id: "no", label: "No", consequence: "No firmo." },
  ],
};

function input(over: Partial<AdmissionInput> = {}): AdmissionInput {
  return {
    risk: "low",
    subject: { id: "asunto-1", label: "Un asunto", body: "el referente" },
    answer_space: choice,
    ...over,
  };
}

describe("el referente", () => {
  it("admits a subject with a body, a uri or attachments", () => {
    expect(checkPayload(input({ subject: { id: "a", label: "A", body: "x" } })).admit).toBe(true);
    expect(checkPayload(input({ subject: { id: "a", label: "A", uri: "https://x" } })).admit).toBe(true);
    expect(checkPayload(input({ subject: { id: "a", label: "A", attachments: ["f_1"] } })).admit).toBe(true);
  });

  // The cat photo with no photo. Undecidable at any stake.
  it("refuses a subject with no referent at all, even at low risk", () => {
    const v = checkPayload(input({ subject: { id: "a", label: "A" } }));
    expect(v.admit).toBe(false);
    if (!v.admit) expect(v.reason).toBe("missing_referent");
  });

  it("admits no referent when the query declares itself self-contained", () => {
    expect(checkPayload(input({ subject: { id: "a", label: "A" }, self_contained: true })).admit).toBe(true);
  });
});

describe("text as a decision space", () => {
  const text: AnswerSpace = { kind: "text", max_length: 500 };

  it("is allowed at low risk", () => {
    expect(checkPayload(input({ answer_space: text })).admit).toBe(true);
  });

  it("is refused above low risk", () => {
    for (const risk of ["medium", "high", "critical"] as const) {
      const v = checkPayload(input({ risk, answer_space: text, subject: { id: "a", label: "A", body: "x" } }));
      expect(v.admit).toBe(false);
      if (!v.admit) expect(v.reason).toBe("text_answer_above_low_risk");
    }
  });
});

describe("fields made only of text", () => {
  const allText: AnswerSpace = {
    kind: "fields",
    fields: [{ id: "a", label: "A", kind: "text", max_length: 50 }],
    effect: "Registro lo que digas.",
  };

  it("is allowed at low risk", () => {
    expect(checkPayload(input({ answer_space: allText })).admit).toBe(true);
  });

  // Otherwise it is an open decision space wearing another name.
  it("is refused above low risk", () => {
    const v = checkPayload(input({ risk: "medium", answer_space: allText }));
    expect(v.admit).toBe(false);
    if (!v.admit) expect(v.reason).toBe("fields_all_text_above_low_risk");
  });
});

describe("consequences", () => {
  it("are not required at low risk", () => {
    const noConsequence: AnswerSpace = {
      kind: "choice", select: "one",
      options: [{ id: "yes", label: "Sí" }, { id: "no", label: "No" }],
    };
    expect(checkPayload(input({ answer_space: noConsequence })).admit).toBe(true);
  });

  it("are required per branch on discrete spaces above low risk", () => {
    const partial: AnswerSpace = {
      kind: "choice", select: "one",
      options: [{ id: "yes", label: "Sí", consequence: "Firmo." }, { id: "no", label: "No" }],
    };
    const v = checkPayload(input({ risk: "medium", answer_space: partial }));
    expect(v.admit).toBe(false);
    if (!v.admit) expect(v.reason).toBe("missing_consequences");
  });

  it("requires both branches of a boolean above low risk", () => {
    const half: AnswerSpace = { kind: "boolean", labels: { t: "Sí", f: "No" } };
    const v = checkPayload(input({ risk: "medium", answer_space: half }));
    expect(v.admit).toBe(false);
    if (!v.admit) expect(v.reason).toBe("missing_consequences");
  });

  it("requires a single effect on continuous spaces above low risk", () => {
    const noEffect: AnswerSpace = { kind: "scalar", unit: "EUR" };
    const v = checkPayload(input({ risk: "high", answer_space: noEffect, subject: { id: "a", label: "A", body: "x", sha256: "abc" } }));
    expect(v.admit).toBe(false);
    if (!v.admit) expect(v.reason).toBe("missing_consequences");
  });
});

describe("el referente en posesión, por encima de medium", () => {
  const withConsequences = choice;

  it("refuses a bare external uri at high risk", () => {
    const v = checkPayload(input({
      risk: "high",
      subject: { id: "a", label: "A", uri: "https://drive.example/x", sha256: "abc" },
      answer_space: withConsequences,
    }));
    expect(v.admit).toBe(false);
    if (!v.admit) expect(v.reason).toBe("external_referent_at_high_risk");
  });

  it("accepts an attachment or an inline body at high risk", () => {
    expect(checkPayload(input({
      risk: "high",
      subject: { id: "a", label: "A", attachments: ["f_1"], sha256: "abc" },
      answer_space: withConsequences,
    })).admit).toBe(true);
  });

  // You cannot hash what you do not have.
  it("requires a sha256 at high risk", () => {
    const v = checkPayload(input({
      risk: "high",
      subject: { id: "a", label: "A", body: "x" },
      answer_space: withConsequences,
    }));
    expect(v.admit).toBe(false);
    if (!v.admit) expect(v.reason).toBe("missing_referent_hash");
  });

  it("does not require a hash at medium risk", () => {
    expect(checkPayload(input({ risk: "medium", answer_space: withConsequences })).admit).toBe(true);
  });
});

describe("cada rechazo trae remedio", () => {
  it("always carries a non-empty remedy, because an agent reads it", () => {
    const v = checkPayload(input({ subject: { id: "a", label: "A" } }));
    expect(v.admit).toBe(false);
    if (!v.admit) {
      expect(v.remedy.length).toBeGreaterThan(0);
      expect(v.detail.length).toBeGreaterThan(0);
    }
  });
});

describe("atLeast", () => {
  it("raises to the higher of the two and never lowers", () => {
    expect(atLeast("low", "high")).toBe("high");
    expect(atLeast("critical", "medium")).toBe("critical");
    expect(atLeast("medium", "medium")).toBe("medium");
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Run: `bun test tests/unit/decidability.test.ts`
Expected: FAIL — módulo inexistente

- [ ] **Step 3: Escribir la implementación**

Crea `src/admission/decidability.ts`:

```ts
import { hasNonTextSlot, isDiscrete, type AnswerSpace } from "../lib/answer-space";

/**
 * Admission answers one question: could a human decide this?
 *
 * These are the rules that need nothing but the payload, so they are pure and
 * hermetically testable. The rules that need history - has this person decided
 * about this subject before? - live in the service, which has the database.
 *
 * Two things are deliberately kept apart here. The REFERENT does not scale with
 * risk: a question about a thing needs the thing, whether it is a photo of a cat
 * or a contract. The EVIDENTIARY weight does scale: consequences, hashes, and a
 * referent we actually hold.
 */

export const RISK_ORDER = ["low", "medium", "high", "critical"] as const;
export type Risk = (typeof RISK_ORDER)[number];

export function atLeast(a: Risk, b: Risk): Risk {
  return RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b;
}

function above(risk: Risk, floor: Risk): boolean {
  return RISK_ORDER.indexOf(risk) > RISK_ORDER.indexOf(floor);
}

export interface Subject {
  id: string;
  label: string;
  uri?: string;
  attachments?: string[];
  body?: string;
  sha256?: string;
}

export interface AdmissionInput {
  risk: Risk;
  subject: Subject;
  self_contained?: boolean;
  answer_space: AnswerSpace;
}

export type AdmissionReason =
  | "missing_referent"
  | "text_answer_above_low_risk"
  | "fields_all_text_above_low_risk"
  | "missing_consequences"
  | "external_referent_at_high_risk"
  | "missing_referent_hash"
  | "prior_decision_without_delta"
  | "clarification_rounds_exhausted";

export type AdmissionVerdict =
  | { admit: true }
  | { admit: false; reason: AdmissionReason; detail: string; remedy: string };

const refuse = (
  reason: AdmissionReason,
  detail: string,
  remedy: string,
): AdmissionVerdict => ({ admit: false, reason, detail, remedy });

/** Do we hold the referent ourselves, or are we taking the agent's word for it? */
function weHoldIt(subject: Subject): boolean {
  return Boolean(subject.body) || Boolean(subject.attachments?.length);
}

function hasReferent(subject: Subject): boolean {
  return weHoldIt(subject) || Boolean(subject.uri);
}

function consequencesComplete(space: AnswerSpace): boolean {
  switch (space.kind) {
    case "boolean":
      return Boolean(space.consequences?.t && space.consequences?.f);
    case "choice":
      return space.options.every((o) => Boolean(o.consequence));
    case "scalar":
    case "date":
    case "fields":
      return Boolean(space.effect);
    case "text":
      return true; // only reachable at low risk, where consequences are not required
  }
}

export function checkPayload(input: AdmissionInput): AdmissionVerdict {
  const { risk, subject, answer_space } = input;

  // 1. The referent. Does not scale with risk: without it there is nothing to
  //    decide about, at any stake.
  if (!input.self_contained && !hasReferent(subject)) {
    return refuse(
      "missing_referent",
      `The subject '${subject.id}' carries no uri, attachments or body, so the human has nothing to look at.`,
      "Attach the artefact, link it with `uri`, inline it with `body`, or set `self_contained: true` if the question really is about nothing.",
    );
  }

  // 2. An open decision space above low risk.
  if (above(risk, "low") && answer_space.kind === "text") {
    return refuse(
      "text_answer_above_low_risk",
      `A free-text answer cannot carry a ${risk}-risk decision.`,
      "Use `boolean`, `choice`, `scalar`, `date` or `fields` so the answer is unambiguous.",
    );
  }

  if (above(risk, "low") && !hasNonTextSlot(answer_space)) {
    return refuse(
      "fields_all_text_above_low_risk",
      "Every slot of this `fields` is text, which is an open decision space under another name.",
      "Give at least one slot a shape: `boolean`, `choice`, `scalar` or `date`.",
    );
  }

  // 3. The human must know what each branch causes before choosing it.
  if (above(risk, "low") && !consequencesComplete(answer_space)) {
    const where = isDiscrete(answer_space)
      ? "every branch needs its own `consequence`"
      : "the space needs a single `effect`";
    return refuse(
      "missing_consequences",
      `A ${risk}-risk question must say what its answer causes, and ${where}.`,
      "State plainly what happens next for each possible answer.",
    );
  }

  // 4. Above medium, we must hold the referent ourselves: you cannot hash what
  //    you do not have, and a sha256 over somebody else's link is the agent's
  //    word rather than a record.
  if (above(risk, "medium")) {
    if (!input.self_contained && !weHoldIt(subject)) {
      return refuse(
        "external_referent_at_high_risk",
        `At ${risk} risk a bare external uri is not enough: we cannot hash what we do not hold.`,
        "Upload the artefact as an attachment, or inline it with `body`.",
      );
    }
    if (!input.self_contained && !subject.sha256) {
      return refuse(
        "missing_referent_hash",
        `A ${risk}-risk decision must record which exact version was decided on.`,
        "Send `subject.sha256` with the hash of the referent as you read it.",
      );
    }
  }

  return { admit: true };
}
```

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

Run: `bun test tests/unit/decidability.test.ts`
Expected: PASS

- [ ] **Step 5: Suite completa, typecheck y commit**

Run: `docker exec agentdialog_redis_1 redis-cli -n 1 FLUSHDB && bun test`
Run: `bunx tsc --noEmit`

```bash
git add src/admission/decidability.ts tests/unit/decidability.test.ts
git commit -m "Add the payload-only decidability rules

Admission answers one question: could a human decide this? These are the
rules that need nothing but the payload, so they stay pure and hermetic.

The referent and the evidentiary weight are deliberately separate. A
question about a thing needs the thing at any stake - that is why a cat
photo with no photo is refused at low risk. Consequences, hashes and
holding the artefact ourselves are what scale with what is at stake."
```

---

### Task 3: Esquema y migración

**Files:**
- Modify: `src/db/schema/enums.ts`
- Modify: `src/db/schema/human-queries.ts`
- Create: `drizzle/` migración generada
- Create: `tests/integration/query-migration.test.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores en código; los tipos jsonb reflejan Tasks 1-2.
- Produces: columnas `risk`, `subject`, `selfContained`, `changes`, `answerSpace`, `clarificationRounds`, `pausedAt`, `insufficientReason`; `answer` pasa a `jsonb`; el enum de estado gana `needs_context` y `cancelled`.

- [ ] **Step 1: Ampliar el enum de estado**

En `src/db/schema/enums.ts`, línea 12:

```ts
export const queryStatusEnum = pgEnum("query_status", [
  "pending", "assigned", "needs_context", "answered", "expired", "cancelled",
]);
export const queryRiskEnum = pgEnum("query_risk", ["low", "medium", "high", "critical"]);
```

- [ ] **Step 2: Añadir las columnas**

En `src/db/schema/human-queries.ts`, dentro de `pgTable`, tras `context`:

```ts
  risk: queryRiskEnum("risk").notNull().default("low"),
  subject: jsonb("subject").$type<Record<string, unknown>>().notNull().default({}),
  selfContained: boolean("self_contained").notNull().default(false),
  changes: jsonb("changes").$type<Array<Record<string, unknown>>>(),
  answerSpace: jsonb("answer_space").$type<Record<string, unknown>>().notNull().default({}),
  clarificationRounds: integer("clarification_rounds").notNull().default(0),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  insufficientReason: varchar("insufficient_reason", { length: 64 }),
```

Cambia el tipo de `answer`:

```ts
  answer: jsonb("answer").$type<Record<string, unknown>>(),
```

Añade `boolean` a los imports de `drizzle-orm/pg-core`, y `queryRiskEnum` al import de `./enums`.

Añade el índice que necesita la detección de decisión previa (Task 5):

```ts
  index("human_queries_subject_idx").on(table.agentId, table.humanEmail),
```

- [ ] **Step 3: Generar la migración**

Run: `bun run db:generate`

Abre el SQL generado en `drizzle/`. Drizzle **no** sabe convertir `answer` de `text` a `jsonb` conservando el contenido: generará un `ALTER COLUMN ... SET DATA TYPE jsonb` que falla con filas existentes. Sustituye esa línea por la conversión explícita, y añade el relleno de las columnas nuevas:

```sql
-- Existing answers were prose. Keep them: the history stays readable and the
-- row itself records that it was decided under the old regime.
ALTER TABLE "human_queries"
  ALTER COLUMN "answer" TYPE jsonb
  USING CASE
    WHEN "answer" IS NULL THEN NULL
    ELSE jsonb_build_object('kind', 'text', 'value', "answer")
  END;

UPDATE "human_queries" SET
  "answer_space" = '{"kind":"text","max_length":32000}'::jsonb,
  "self_contained" = true,
  "subject" = jsonb_build_object(
    'id', 'legacy:' || "id"::text,
    'label', left("question", 80)
  )
WHERE "answer_space" = '{}'::jsonb;
```

- [ ] **Step 4: Escribir el test de migración**

Crea `tests/integration/query-migration.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { getDb } from "../../src/db";

/**
 * Rows created before the migration are kept, not discarded: the history stays
 * readable, and the row itself records that it was decided under the old
 * regime. Discarding them would lose exactly the record this feature exists to
 * protect.
 */

describe("migración de filas antiguas", () => {
  it("leaves every row with a usable answer_space", async () => {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT count(*)::int AS n FROM human_queries
      WHERE answer_space IS NULL OR answer_space = '{}'::jsonb
    `);
    expect((rows as any)[0].n).toBe(0);
  });

  it("leaves every answered row with a structured answer", async () => {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT count(*)::int AS n FROM human_queries
      WHERE status = 'answered' AND (answer IS NULL OR answer->>'kind' IS NULL)
    `);
    expect((rows as any)[0].n).toBe(0);
  });

  it("accepts the two new statuses", async () => {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT unnest(enum_range(NULL::query_status))::text AS v
    `);
    const values = (rows as any).map((r: any) => r.v);
    expect(values).toContain("needs_context");
    expect(values).toContain("cancelled");
  });
});
```

- [ ] **Step 5: Aplicar y ejecutar**

```bash
docker compose -f docker-compose.dev.yml up -d postgres redis
DATABASE_URL="postgresql://agentdialog:agentdialog@localhost:5432/agentdialog_test" \
  SESSION_SECRET="test-secret-minimum-32-characters-long!!" bun run scripts/migrate.ts
docker exec agentdialog_redis_1 redis-cli -n 1 FLUSHDB
bun test tests/integration/query-migration.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/db/schema/ drizzle/ tests/integration/query-migration.test.ts
git commit -m "Add the typed query columns and migrate the prose answers

answer moves from text to jsonb, and existing rows are converted rather
than dropped: an old answer becomes {kind:text,value:...} and its query
gets a text answer_space. The history stays readable and each row records
that it was decided under the old regime.

Drizzle cannot generate that conversion itself - its ALTER COLUMN fails on
existing rows - so the USING clause is written by hand."
```

---

### Task 4: Validadores y `createQuery` bajo admisión

**Files:**
- Modify: `src/validators/query.validators.ts`
- Modify: `src/lib/errors.ts`
- Modify: `src/middleware/error-handler.ts`
- Modify: `src/services/query.service.ts`
- Modify: `src/routes/agent/queries.ts`
- Create: `tests/integration/typed-queries-create.test.ts`

**Interfaces:**
- Consumes: `answerSpaceSchema` (Task 1); `checkPayload`, `AdmissionVerdict`, `Risk` (Task 2); las columnas de Task 3.
- Produces:
  - `class UndecidableQueryError extends AppError` con `reason`, `detail`, `remedy`, `priorQueryId?`
  - `createQuerySchema` con los campos nuevos
  - Las tareas 5-9 dependen de `UndecidableQueryError`.

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/integration/typed-queries-create.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { createTestApp, createTestAgent } from "../helpers";

const app = createTestApp();

async function post(body: unknown) {
  const { authHeader } = await createTestAgent();
  return app.request("/api/v1/agent/queries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify(body),
  });
}

const base = {
  query_type: "validation",
  risk: "low",
  subject: { id: "asunto-1", label: "Un asunto", body: "el referente" },
  question: "¿Seguimos?",
  answer_space: {
    kind: "choice", select: "one",
    options: [{ id: "yes", label: "Sí" }, { id: "no", label: "No" }],
  },
  target_human_email: "quien@example.com",
  timeout_minutes: 60,
};

describe("POST /agent/queries con espacio de respuesta", () => {
  it("creates a query that carries a referent and a closed answer space", async () => {
    const res = await post({ ...base, target_human_email: `a-${Date.now()}@example.com` });
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.query_id).toBeString();
  });

  it("refuses a subject with no referent, with a remedy an agent can act on", async () => {
    const res = await post({ ...base, subject: { id: "a", label: "A" },
                             target_human_email: `b-${Date.now()}@example.com` });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("UNDECIDABLE_QUERY");
    expect(body.error.reason).toBe("missing_referent");
    expect(body.error.remedy).toBeString();
    expect(body.error.remedy.length).toBeGreaterThan(0);
  });

  it("refuses a free-text answer space above low risk", async () => {
    const res = await post({
      ...base, risk: "high",
      subject: { id: "a", label: "A", body: "x", sha256: "abc" },
      answer_space: { kind: "text", max_length: 500 },
      target_human_email: `c-${Date.now()}@example.com`,
    });
    expect(res.status).toBe(422);
    expect((await res.json()).error.reason).toBe("text_answer_above_low_risk");
  });

  it("refuses a shape outside the catalogue", async () => {
    const res = await post({
      ...base,
      answer_space: { kind: "json_schema", schema: { type: "object" } },
      target_human_email: `d-${Date.now()}@example.com`,
    });
    expect(res.status).toBe(422);
  });

  it("refuses a query with no answer_space at all", async () => {
    const { answer_space, ...withoutSpace } = base;
    const res = await post({ ...withoutSpace, target_human_email: `e-${Date.now()}@example.com` });
    expect(res.status).toBe(422);
  });

  // The escape hatch, and it is explicit on purpose.
  it("admits a self-contained question with no referent", async () => {
    const res = await post({
      ...base, self_contained: true, subject: { id: "viernes", label: "Despliegue del viernes" },
      question: "¿Desplegamos un viernes?",
      target_human_email: `f-${Date.now()}@example.com`,
    });
    expect(res.status).toBe(201);
  });

  it("does not create anything when admission refuses", async () => {
    const { authHeader } = await createTestAgent();
    const before = await app.request("/api/v1/agent/queries?limit=100", { headers: { Authorization: authHeader } });
    const countBefore = (await before.json()).data.length;

    await app.request("/api/v1/agent/queries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({ ...base, subject: { id: "a", label: "A" },
                             target_human_email: `g-${Date.now()}@example.com` }),
    });

    const after = await app.request("/api/v1/agent/queries?limit=100", { headers: { Authorization: authHeader } });
    expect((await after.json()).data.length).toBe(countBefore);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `docker exec agentdialog_redis_1 redis-cli -n 1 FLUSHDB && bun test tests/integration/typed-queries-create.test.ts`
Expected: FAIL — hoy se acepta cualquier payload sin `answer_space`

- [ ] **Step 3: El error que un agente puede leer**

En `src/lib/errors.ts`, al final:

```ts
/**
 * The receiver of this error is an agent, not a person reading documentation.
 * It can only correct itself and retry if the error says what is missing, so
 * `remedy` is part of the contract rather than a courtesy.
 */
export class UndecidableQueryError extends AppError {
  constructor(
    public reason: string,
    public detail: string,
    public remedy: string,
    public priorQueryId?: string,
  ) {
    super(422, detail, "UNDECIDABLE_QUERY");
    this.name = "UndecidableQueryError";
  }
}
```

En `src/middleware/error-handler.ts`, dentro del bloque `err instanceof AppError`, sustituye el cuerpo por:

```ts
  if (err instanceof AppError) {
    const extra: Record<string, unknown> = {};
    if ("retryAfter" in err) extra.retryAfter = (err as any).retryAfter;
    if (err instanceof UndecidableQueryError) {
      extra.reason = err.reason;
      extra.detail = err.detail;
      extra.remedy = err.remedy;
      if (err.priorQueryId) extra.prior_query_id = err.priorQueryId;
    }
    return c.json(
      { error: { code: err.code, message: err.message, ...extra } },
      err.statusCode as any,
    );
  }
```

Y añade `UndecidableQueryError` al import de `../lib/errors`.

- [ ] **Step 4: Los validadores**

En `src/validators/query.validators.ts`, sustituye `createQuerySchema`:

```ts
import { answerSpaceSchema, answerSchema } from "../lib/answer-space";

const subjectSchema = z.object({
  id: z.string().min(1).max(128),
  label: z.string().min(1).max(200),
  uri: z.string().url().optional(),
  attachments: z.array(z.string().uuid()).max(10).optional(),
  body: z.string().max(100_000).optional(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
});

const changeSchema = z.object({
  path: z.string().min(1).max(200),
  before: z.string().max(2_000),
  after: z.string().max(2_000),
  materiality: z.enum(["minor", "material"]),
});

export const createQuerySchema = z.object({
  query_type: z.enum(["validation", "interpretation", "expert_query", "labeling"]),
  risk: z.enum(["low", "medium", "high", "critical"]).default("low"),
  subject: subjectSchema,
  self_contained: z.boolean().default(false),
  question: z.string().min(1).max(10_000),
  context: z.string().max(100_000).optional(),
  changes: z.array(changeSchema).max(100).optional(),
  answer_space: answerSpaceSchema,
  target_human_email: z.string().email(),
  confidence: z.number().min(0).max(1).optional(),
  timeout_minutes: z.number().int().min(1).max(10080).default(60),
  metadata: z.record(z.unknown()).optional(),
});
```

- [ ] **Step 5: Llamar a la admisión antes de la transacción**

En `src/services/query.service.ts`, al principio de `createQuery`, **antes** de `db.transaction`:

```ts
import { checkPayload } from "../admission/decidability";
import { UndecidableQueryError } from "../lib/errors";

export async function createQuery(agentId: string, input: CreateQueryInput) {
  const db = getDb();

  // Admission runs before the transaction opens: a query that a human could not
  // decide never becomes a row, a conversation, an invitation or an email.
  const verdict = checkPayload({
    risk: input.risk,
    subject: input.subject,
    self_contained: input.self_contained,
    answer_space: input.answer_space,
  });
  if (!verdict.admit) {
    throw new UndecidableQueryError(verdict.reason, verdict.detail, verdict.remedy);
  }

  const result = await db.transaction(async (tx) => {
```

Y en el `insert` de `humanQueries`, añade las columnas nuevas junto a las existentes:

```ts
        risk: input.risk,
        subject: input.subject,
        selfContained: input.self_contained,
        changes: input.changes,
        answerSpace: input.answer_space,
```

- [ ] **Step 6: Ejecutar y comprobar que pasa**

Run: `docker exec agentdialog_redis_1 redis-cli -n 1 FLUSHDB && bun test tests/integration/typed-queries-create.test.ts`
Expected: PASS

- [ ] **Step 7: Suite, typecheck y commit**

Run: `docker exec agentdialog_redis_1 redis-cli -n 1 FLUSHDB && bun test`
Run: `bunx tsc --noEmit`

Otros tests fallarán aquí: `tests/integration/agent-queries.test.ts` y `conversation-flow.test.ts` crean queries con el payload viejo. **Actualízalos al payload nuevo** — es la ruptura limpia que el spec decidió, no un fallo.

```bash
git add src/validators/query.validators.ts src/lib/errors.ts src/middleware/error-handler.ts \
  src/services/query.service.ts tests/
git commit -m "Refuse a query a human could not decide

createQuery now runs admission before the transaction opens, so an
undecidable question never becomes a row, a conversation, an invitation or
an email.

The 422 carries reason, detail and remedy. Its receiver is an agent, not a
person reading documentation: it can only correct itself and retry if the
error says what is missing."
```

---

### Task 5: Detección de decisión previa y elevación del riesgo

Las dos reglas que **no** son puras: necesitan historial.

**Files:**
- Create: `src/admission/history.ts`
- Modify: `src/services/query.service.ts`
- Modify: `src/env.ts`
- Modify: `.env.example`
- Create: `tests/integration/typed-queries-history.test.ts`

**Interfaces:**
- Consumes: `Risk`, `atLeast`, `AdmissionVerdict` (Task 2); `UndecidableQueryError` (Task 4).
- Produces:
  - `findPriorDecision(agentId, humanEmail, subjectId): Promise<{ id: string; decidedAt: Date } | null>`
  - `elevateRisk(declared: Risk, opts: { hasPriorDecision: boolean; answerSpace: AnswerSpace }): Risk`
  - `RISK_ELEVATION_AMOUNT` en `src/env.ts`, defecto `1000`.

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/integration/typed-queries-history.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { createTestApp, createTestAgent } from "../helpers";
import { respondQuery } from "../../src/services/query.service";
import { getDb } from "../../src/db";
import { humanQueries } from "../../src/db/schema/human-queries";
import { eq } from "drizzle-orm";

/**
 * The delta is demanded by the system from its own history, not declared by the
 * agent. An agent cannot dodge it by omitting the fact that there was a prior
 * decision - which is the whole point.
 */

const app = createTestApp();

const spaceWithConsequences = {
  kind: "choice", select: "one",
  options: [
    { id: "yes", label: "Sí", consequence: "Firmo hoy." },
    { id: "no", label: "No", consequence: "No firmo." },
  ],
};

function payload(over: Record<string, unknown> = {}) {
  return {
    query_type: "validation",
    risk: "medium",
    subject: { id: "contrato-a", label: "Contrato A", body: "el texto" },
    question: "¿Renovamos?",
    answer_space: spaceWithConsequences,
    timeout_minutes: 60,
    ...over,
  };
}

async function create(authHeader: string, body: Record<string, unknown>) {
  return app.request("/api/v1/agent/queries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify(body),
  });
}

describe("decisión previa sobre el mismo asunto", () => {
  it("demands a delta on the second question, and the agent cannot dodge it", async () => {
    const { agent, authHeader } = await createTestAgent();
    const email = `hist-${Date.now()}@example.com`;

    const first = await create(authHeader, payload({ target_human_email: email }));
    expect(first.status).toBe(201);
    const { data } = await first.json();

    // Answer it, so there is a decision to remember.
    const db = getDb();
    const [row] = await db.select().from(humanQueries).where(eq(humanQueries.id, data.query_id));
    await db.update(humanQueries)
      .set({ status: "answered", answer: { kind: "choice", option_ids: ["yes"] } })
      .where(eq(humanQueries.id, row.id));

    // Same subject, same human, same agent, no `changes`.
    const second = await create(authHeader, payload({ target_human_email: email }));
    expect(second.status).toBe(422);
    const body = await second.json();
    expect(body.error.reason).toBe("prior_decision_without_delta");
    expect(body.error.prior_query_id).toBe(row.id);

    // With the delta, it goes through.
    const third = await create(authHeader, payload({
      target_human_email: email,
      changes: [{ path: "Precio", before: "100", after: "120", materiality: "material" }],
    }));
    expect(third.status).toBe(201);
  });

  it("does not count an expired query as a decision", async () => {
    const { authHeader } = await createTestAgent();
    const email = `exp-${Date.now()}@example.com`;

    const first = await create(authHeader, payload({ target_human_email: email }));
    const { data } = await first.json();
    const db = getDb();
    await db.update(humanQueries).set({ status: "expired" }).where(eq(humanQueries.id, data.query_id));

    // Nobody decided anything, so there is no memory to contradict.
    const second = await create(authHeader, payload({ target_human_email: email }));
    expect(second.status).toBe(201);
  });

  it("scopes the subject to the agent", async () => {
    const a = await createTestAgent();
    const b = await createTestAgent();
    const email = `scope-${Date.now()}@example.com`;

    const first = await create(a.authHeader, payload({ target_human_email: email }));
    const { data } = await first.json();
    const db = getDb();
    await db.update(humanQueries)
      .set({ status: "answered", answer: { kind: "choice", option_ids: ["yes"] } })
      .where(eq(humanQueries.id, data.query_id));

    // Agent B's 'contrato-a' is not agent A's.
    const second = await create(b.authHeader, payload({ target_human_email: email }));
    expect(second.status).toBe(201);
  });
});

describe("elevación del riesgo", () => {
  it("raises a low-risk money question to high, and then demands what high demands", async () => {
    const { authHeader } = await createTestAgent();
    const res = await create(authHeader, payload({
      risk: "low",
      target_human_email: `money-${Date.now()}@example.com`,
      answer_space: { kind: "scalar", unit: "EUR", max: 50_000, effect: "Ordeno el pago." },
      subject: { id: "pago-1", label: "Pago", uri: "https://drive.example/x" },
    }));
    // Elevated to high, so a bare external uri is no longer enough.
    expect(res.status).toBe(422);
    expect((await res.json()).error.reason).toBe("external_referent_at_high_risk");
  });

  it("never lowers a declared risk", async () => {
    const { authHeader } = await createTestAgent();
    const res = await create(authHeader, payload({
      risk: "critical",
      target_human_email: `crit-${Date.now()}@example.com`,
      subject: { id: "c-1", label: "C", body: "x" },   // no sha256
    }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.reason).toBe("missing_referent_hash");
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `docker exec agentdialog_redis_1 redis-cli -n 1 FLUSHDB && bun test tests/integration/typed-queries-history.test.ts`
Expected: FAIL — la segunda pregunta se acepta

- [ ] **Step 3: La variable de umbral**

En `src/env.ts`, junto a las demás:

```ts
  // The amount above which a money question is treated as high risk regardless
  // of what the agent declared. Deliberately crude: no currency conversion, the
  // number is compared as-is. Comparing euros with yen without a rate table
  // would be worse than not comparing, and its job is to raise the floor rather
  // than to measure.
  RISK_ELEVATION_AMOUNT: z.coerce.number().default(1000),
```

En `.env.example`:

```
# Money questions above this amount are treated as high risk whatever the agent declared
RISK_ELEVATION_AMOUNT=1000
```

- [ ] **Step 4: Escribir el módulo de historial**

Crea `src/admission/history.ts`:

```ts
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { humanQueries } from "../db/schema/human-queries";
import { env } from "../env";
import { atLeast, type Risk } from "./decidability";
import type { AnswerSpace } from "../lib/answer-space";

/**
 * The two rules that cannot be pure: they need history.
 *
 * Both exist so the system verifies with what it already knows rather than
 * trusting what the agent declares. An agent can omit the fact that it asked
 * before; it cannot omit our record of it.
 */

/** ISO 4217-ish: three letters. Enough to tell "EUR" from "kg". */
const CURRENCY = /^[A-Z]{3}$/;

/**
 * A prior decision is an ANSWERED query about the same subject, from the same
 * agent, to the same person. An expired or cancelled one does not count: nobody
 * decided anything, so there is no memory to contradict and no delta to explain.
 */
export async function findPriorDecision(
  agentId: string,
  humanEmail: string,
  subjectId: string,
): Promise<{ id: string; decidedAt: Date } | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: humanQueries.id, decidedAt: humanQueries.updatedAt })
    .from(humanQueries)
    .where(
      and(
        eq(humanQueries.agentId, agentId),
        eq(humanQueries.humanEmail, humanEmail.toLowerCase().trim()),
        eq(humanQueries.status, "answered"),
        sql`${humanQueries.subject}->>'id' = ${subjectId}`,
      ),
    )
    .orderBy(desc(humanQueries.updatedAt))
    .limit(1);

  return row ? { id: row.id, decidedAt: row.decidedAt } : null;
}

function largestMoneyAmount(space: AnswerSpace): number | null {
  const consider = (unit: string, max?: number, proposed?: unknown): number | null => {
    if (!CURRENCY.test(unit)) return null;
    if (typeof max === "number") return max;
    if (typeof proposed === "number") return proposed;
    return null;
  };

  if (space.kind === "scalar") return consider(space.unit, space.max);
  if (space.kind === "fields") {
    let biggest: number | null = null;
    for (const f of space.fields) {
      if (f.kind !== "scalar") continue;
      const v = consider(f.unit, f.max, f.proposed);
      if (v !== null && (biggest === null || v > biggest)) biggest = v;
    }
    return biggest;
  }
  return null;
}

/**
 * The agent declares a floor; the system raises it and never lowers it. The
 * value of this is not that it is clever - it is that it cannot be dodged.
 */
export function elevateRisk(
  declared: Risk,
  opts: { hasPriorDecision: boolean; answerSpace: AnswerSpace },
): Risk {
  let risk = declared;
  if (opts.hasPriorDecision) risk = atLeast(risk, "medium");

  const amount = largestMoneyAmount(opts.answerSpace);
  if (amount !== null && amount > env().RISK_ELEVATION_AMOUNT) {
    risk = atLeast(risk, "high");
  }
  return risk;
}
```

- [ ] **Step 5: Enganchar en `createQuery`**

En `src/services/query.service.ts`, sustituye el bloque de admisión que añadió la Task 4:

```ts
  // History first: it decides both the effective risk and whether a delta is
  // owed, and the payload rules are judged at the ELEVATED risk, not the
  // declared one.
  const prior = await findPriorDecision(agentId, input.target_human_email, input.subject.id);
  const risk = elevateRisk(input.risk, {
    hasPriorDecision: prior !== null,
    answerSpace: input.answer_space,
  });

  if (prior && risk !== "low" && (!input.changes || input.changes.length === 0)) {
    throw new UndecidableQueryError(
      "prior_decision_without_delta",
      `This person decided about '${input.subject.id}' on ${prior.decidedAt.toISOString().slice(0, 10)}.`,
      "Send `changes` with what has changed since then.",
      prior.id,
    );
  }

  const verdict = checkPayload({
    risk,
    subject: input.subject,
    self_contained: input.self_contained,
    answer_space: input.answer_space,
  });
  if (!verdict.admit) {
    throw new UndecidableQueryError(verdict.reason, verdict.detail, verdict.remedy);
  }
```

Y guarda el riesgo **elevado**, no el declarado: en el `insert`, `risk: risk`.

Añade a los imports: `import { findPriorDecision, elevateRisk } from "../admission/history";`

- [ ] **Step 6: Ejecutar y comprobar que pasa**

Run: `docker exec agentdialog_redis_1 redis-cli -n 1 FLUSHDB && bun test tests/integration/typed-queries-history.test.ts`
Expected: PASS

- [ ] **Step 7: Suite, typecheck y commit**

```bash
git add src/admission/history.ts src/services/query.service.ts src/env.ts .env.example \
  tests/integration/typed-queries-history.test.ts
git commit -m "Demand the delta from our own history, not from the agent

A second question about a subject this person already decided is refused
unless it says what changed. The system detects that from its own records,
so an agent cannot dodge it by omitting that there was a prior decision -
which is the entire point of putting the check here rather than trusting a
declaration.

Risk elevation works the same way: the agent declares a floor and the
system raises it. Only two signals, both mechanical. Its value is not that
it is clever, it is that it cannot be dodged."
```

---

### Task 6: `respondQuery` con salida discriminada y `needs_context`

**Files:**
- Modify: `src/validators/query.validators.ts`
- Modify: `src/services/query.service.ts`
- Modify: `src/routes/human/queries.ts`
- Create: `tests/integration/typed-queries-respond.test.ts`

**Interfaces:**
- Consumes: `answerSchema`, `validateAnswerAgainstSpace` (Task 1); columnas de Task 3.
- Produces:
  - `respondQuerySchema` discriminado por `outcome`
  - `respondQuery(queryId, humanId, input)` acepta ambas salidas
  - La Task 7 depende de que `needs_context` sella `pausedAt` e incrementa `clarificationRounds`.

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/integration/typed-queries-respond.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { createTestApp, createTestAgent, createTestHuman } from "../helpers";
import { getDb } from "../../src/db";
import { humanQueries } from "../../src/db/schema/human-queries";
import { conversationParticipants } from "../../src/db/schema/participants";
import { eq } from "drizzle-orm";

const app = createTestApp();

const space = {
  kind: "choice", select: "one",
  options: [
    { id: "yes", label: "Sí", consequence: "Firmo." },
    { id: "no", label: "No", consequence: "No firmo." },
  ],
};

/** Creates a query and puts the human in a position to answer it. */
async function ready(email: string) {
  const { authHeader } = await createTestAgent();
  const res = await app.request("/api/v1/agent/queries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify({
      query_type: "validation", risk: "low",
      subject: { id: `s-${Date.now()}`, label: "S", body: "x" },
      question: "¿Seguimos?", answer_space: space,
      target_human_email: email, timeout_minutes: 60,
    }),
  });
  const { data } = await res.json();
  const human = await createTestHuman(email);
  const db = getDb();
  const [row] = await db.select().from(humanQueries).where(eq(humanQueries.id, data.query_id));
  await db.insert(conversationParticipants).values({
    conversationId: row.conversationId, actorType: "human",
    humanId: human.human.id, role: "participant",
  }).onConflictDoNothing();
  await db.update(humanQueries).set({ status: "assigned", humanId: human.human.id })
    .where(eq(humanQueries.id, row.id));
  return { queryId: row.id, human, agentAuth: authHeader };
}

describe("respuesta tipada", () => {
  it("records a structured answer", async () => {
    const { queryId, human } = await ready(`r1-${Date.now()}@example.com`);
    const res = await app.request(`/api/v1/human/queries/${queryId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: human.authHeader },
      body: JSON.stringify({ outcome: "answer", answer: { kind: "choice", option_ids: ["yes"] } }),
    });
    expect(res.status).toBe(200);
    const db = getDb();
    const [row] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));
    expect(row.status).toBe("answered");
    expect(row.answer).toEqual({ kind: "choice", option_ids: ["yes"] });
  });

  it("refuses an option that was never offered", async () => {
    const { queryId, human } = await ready(`r2-${Date.now()}@example.com`);
    const res = await app.request(`/api/v1/human/queries/${queryId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: human.authHeader },
      body: JSON.stringify({ outcome: "answer", answer: { kind: "choice", option_ids: ["inventado"] } }),
    });
    expect(res.status).toBe(422);
  });

  it("refuses an answer whose kind does not match the space", async () => {
    const { queryId, human } = await ready(`r3-${Date.now()}@example.com`);
    const res = await app.request(`/api/v1/human/queries/${queryId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: human.authHeader },
      body: JSON.stringify({ outcome: "answer", answer: { kind: "boolean", value: true } }),
    });
    expect(res.status).toBe(422);
  });
});

describe("insufficient_context", () => {
  it("returns the turn without closing the query, and freezes the clock", async () => {
    const { queryId, human } = await ready(`r4-${Date.now()}@example.com`);
    const db = getDb();
    const [before] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));

    const res = await app.request(`/api/v1/human/queries/${queryId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: human.authHeader },
      body: JSON.stringify({ outcome: "insufficient_context", reason: "missing_delta",
                             note: "¿qué ha cambiado?" }),
    });
    expect(res.status).toBe(200);

    const [after] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));
    expect(after.status).toBe("needs_context");
    expect(after.insufficientReason).toBe("missing_delta");
    expect(after.clarificationRounds).toBe(1);
    expect(after.pausedAt).not.toBeNull();
    expect(after.answer).toBeNull();
    expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime());
  });

  it("refuses a reason outside the closed set", async () => {
    const { queryId, human } = await ready(`r5-${Date.now()}@example.com`);
    const res = await app.request(`/api/v1/human/queries/${queryId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: human.authHeader },
      body: JSON.stringify({ outcome: "insufficient_context", reason: "porque no me apetece" }),
    });
    expect(res.status).toBe(422);
  });

  it("accepts not_my_decision, which is not a lack of context", async () => {
    const { queryId, human } = await ready(`r6-${Date.now()}@example.com`);
    const res = await app.request(`/api/v1/human/queries/${queryId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: human.authHeader },
      body: JSON.stringify({ outcome: "insufficient_context", reason: "not_my_decision" }),
    });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `docker exec agentdialog_redis_1 redis-cli -n 1 FLUSHDB && bun test tests/integration/typed-queries-respond.test.ts`
Expected: FAIL

- [ ] **Step 3: El validador discriminado**

En `src/validators/query.validators.ts`, sustituye `respondQuerySchema`:

```ts
export const INSUFFICIENT_REASONS = [
  "unknown_subject", "missing_delta", "unclear_consequences",
  "referent_unreachable", "not_my_decision",
] as const;

export const respondQuerySchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("answer"),
    answer: answerSchema,
    comment: z.string().max(32_000).optional(),
    confidence: z.number().min(0).max(1).optional(),
  }),
  z.object({
    outcome: z.literal("insufficient_context"),
    reason: z.enum(INSUFFICIENT_REASONS),
    note: z.string().max(2_000).optional(),
  }),
]);
```

- [ ] **Step 4: El servicio**

En `src/services/query.service.ts`, en `respondQuery`, tras la comprobación de participante, bifurca:

```ts
  if (input.outcome === "insufficient_context") {
    // The turn goes back to the agent. The clock freezes because it is now the
    // agent's move: without this a query dies while the agent is fixing it, and
    // the human watches something expire that they themselves asked to clarify.
    const [updated] = await db
      .update(humanQueries)
      .set({
        status: "needs_context",
        insufficientReason: input.reason,
        clarificationRounds: query.clarificationRounds + 1,
        pausedAt: new Date(),
        humanId,
        updatedAt: new Date(),
      })
      .where(and(eq(humanQueries.id, queryId), eq(humanQueries.status, "assigned")))
      .returning();

    if (!updated) throw new ConflictError("Query is no longer awaiting an answer");

    dispatchWebhooks(query.agentId, "query.needs_context", {
      query_id: query.id,
      status: "needs_context",
      reason: input.reason,
      note: input.note,
    }).catch((err) => console.error(`[QUERY] Webhook dispatch failed for ${queryId}:`, err));

    return updated;
  }

  // From here, outcome === "answer".
  const space = query.answerSpace as unknown as AnswerSpace;
  const fit = validateAnswerAgainstSpace(space, input.answer);
  if (!fit.ok) {
    throw new ValidationError(`Answer does not fit this query: ${fit.problem}`);
  }
```

Y en el bloque existente que ya escribía la respuesta, sustituye los campos de prosa:

```ts
      answer: input.answer,
      answerComment: input.comment,
```

El `content` del mensaje deja de ser `input.answer`; usa un resumen legible:

```ts
      content: summariseAnswer(space, input.answer),
      structuredData: {
        queryId: query.id,
        answer: input.answer,
        comment: input.comment,
        confidence: input.confidence,
      },
```

Añade al final del fichero:

```ts
/** A one-line rendering of a typed answer, for the conversation transcript. */
function summariseAnswer(space: AnswerSpace, answer: Answer): string {
  switch (answer.kind) {
    case "boolean":
      return space.kind === "boolean"
        ? (answer.value ? space.labels.t : space.labels.f)
        : String(answer.value);
    case "choice": {
      if (space.kind !== "choice") return answer.option_ids.join(", ");
      const byId = new Map(space.options.map((o) => [o.id, o.label]));
      return answer.option_ids.map((id) => byId.get(id) ?? id).join(", ");
    }
    case "scalar":
      return space.kind === "scalar" ? `${answer.value} ${space.unit}` : String(answer.value);
    case "date":
      return answer.value;
    case "text":
      return answer.value;
    case "fields":
      return Object.entries(answer.values).map(([k, v]) => `${k}: ${v}`).join("; ");
  }
}
```

Imports nuevos: `validateAnswerAgainstSpace`, `type AnswerSpace`, `type Answer` de `../lib/answer-space`, y `ValidationError` de `../lib/errors`.

- [ ] **Step 5: Actualizar la comprobación de estado**

En `respondQuery`, la guarda inicial debe aceptar `assigned` **y** `needs_context` — un humano puede contestar aunque antes pidiera contexto. Sustituye:

```ts
  if (query.status === "answered") throw new ForbiddenError("Query has already been answered");
  if (query.status === "expired") throw new ForbiddenError("Query has expired");
  if (query.status === "cancelled") throw new ForbiddenError("Query was cancelled by the agent");
```

Y el `where` del `update` de la rama de respuesta pasa a:

```ts
    .where(and(
      eq(humanQueries.id, queryId),
      inArray(humanQueries.status, ["assigned", "needs_context"]),
    ))
```

- [ ] **Step 6: Ejecutar, suite, typecheck y commit**

Run: `docker exec agentdialog_redis_1 redis-cli -n 1 FLUSHDB && bun test`
Run: `bunx tsc --noEmit`

```bash
git add src/validators/query.validators.ts src/services/query.service.ts \
  src/routes/human/queries.ts tests/integration/typed-queries-respond.test.ts
git commit -m "Give the human a third answer, and check the answer fits

A human can now say they cannot decide, from a closed set of reasons, and
the query returns the turn to the agent instead of closing. That state -
'I do not know what you are asking me about' - is the most frequent honest
one and until now it collapsed into either a rejection that blocks or a yes
that should not count.

The clock freezes while the agent holds the turn, so a query cannot die
while it is being fixed."
```

---

### Task 7: `PATCH` del agente, reanudación del reloj y tope de rondas

**Files:**
- Modify: `src/validators/query.validators.ts`
- Modify: `src/services/query.service.ts`
- Modify: `src/routes/agent/queries.ts`
- Create: `tests/integration/typed-queries-patch.test.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: `updateQuery(queryId, agentId, input)`; `PATCH /api/v1/agent/queries/:id`.

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/integration/typed-queries-patch.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { createTestApp } from "../helpers";
import { getDb } from "../../src/db";
import { humanQueries } from "../../src/db/schema/human-queries";
import { eq } from "drizzle-orm";

const app = createTestApp();

// Reuse the helper shape from typed-queries-respond.test.ts: a query in
// needs_context, with its human able to answer.
import { readyInNeedsContext } from "../helpers/queries";

describe("PATCH /agent/queries/:id", () => {
  it("returns the query to assigned and resumes the clock", async () => {
    const { queryId, agentAuth } = await readyInNeedsContext(`p1-${Date.now()}@example.com`);
    const db = getDb();
    const [before] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));
    expect(before.pausedAt).not.toBeNull();

    const res = await app.request(`/api/v1/agent/queries/${queryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: agentAuth },
      body: JSON.stringify({
        changes: [{ path: "Precio", before: "100", after: "120", materiality: "material" }],
      }),
    });
    expect(res.status).toBe(200);

    const [after] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));
    expect(after.status).toBe("assigned");
    expect(after.pausedAt).toBeNull();
    // The clock was pushed forward by roughly the time it spent paused.
    expect(after.expiresAt.getTime()).toBeGreaterThanOrEqual(before.expiresAt.getTime());
  });

  it("refuses a PATCH from any state other than needs_context", async () => {
    const { queryId, agentAuth } = await readyInNeedsContext(`p2-${Date.now()}@example.com`);
    const db = getDb();
    await db.update(humanQueries).set({ status: "assigned", pausedAt: null })
      .where(eq(humanQueries.id, queryId));

    const res = await app.request(`/api/v1/agent/queries/${queryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: agentAuth },
      body: JSON.stringify({ context: "más contexto" }),
    });
    expect(res.status).toBe(409);
  });

  it("runs the patched query through admission again", async () => {
    const { queryId, agentAuth } = await readyInNeedsContext(`p3-${Date.now()}@example.com`);
    const res = await app.request(`/api/v1/agent/queries/${queryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: agentAuth },
      body: JSON.stringify({ subject: { id: "sin-referente", label: "Sin referente" } }),
    });
    expect(res.status).toBe(422);
    expect((await res.json()).error.reason).toBe("missing_referent");
  });

  it("exhausts after two rounds, and unfreezes the clock so the query can expire", async () => {
    const { queryId, agentAuth } = await readyInNeedsContext(`p4-${Date.now()}@example.com`);
    const db = getDb();
    // Pretend two rounds already happened.
    await db.update(humanQueries).set({ clarificationRounds: 2 }).where(eq(humanQueries.id, queryId));

    const res = await app.request(`/api/v1/agent/queries/${queryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: agentAuth },
      body: JSON.stringify({ context: "un intento más" }),
    });
    expect(res.status).toBe(422);
    expect((await res.json()).error.reason).toBe("clarification_rounds_exhausted");

    // Without this the query would stay frozen for ever.
    const [after] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));
    expect(after.pausedAt).toBeNull();
  });
});
```

Crea el ayudante `tests/helpers/queries.ts`:

```ts
import { eq } from "drizzle-orm";
import { createTestApp, createTestAgent, createTestHuman } from "./index";
import { getDb } from "../../src/db";
import { humanQueries } from "../../src/db/schema/human-queries";
import { conversationParticipants } from "../../src/db/schema/participants";

const SPACE = {
  kind: "choice", select: "one",
  options: [
    { id: "yes", label: "Sí", consequence: "Firmo." },
    { id: "no", label: "No", consequence: "No firmo." },
  ],
};

/** A query sitting in needs_context, with its clock paused. */
export async function readyInNeedsContext(email: string) {
  const app = createTestApp();
  const { authHeader } = await createTestAgent();
  const res = await app.request("/api/v1/agent/queries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify({
      query_type: "validation", risk: "low",
      subject: { id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: "S", body: "x" },
      question: "¿Seguimos?", answer_space: SPACE,
      target_human_email: email, timeout_minutes: 60,
    }),
  });
  const { data } = await res.json();
  const human = await createTestHuman(email);
  const db = getDb();
  const [row] = await db.select().from(humanQueries).where(eq(humanQueries.id, data.query_id));
  await db.insert(conversationParticipants).values({
    conversationId: row.conversationId, actorType: "human",
    humanId: human.human.id, role: "participant",
  }).onConflictDoNothing();
  await db.update(humanQueries).set({
    status: "needs_context", humanId: human.human.id,
    clarificationRounds: 1, pausedAt: new Date(Date.now() - 60_000),
    insufficientReason: "missing_delta",
  }).where(eq(humanQueries.id, row.id));

  return { queryId: row.id, human, agentAuth: authHeader, conversationId: row.conversationId };
}
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `docker exec agentdialog_redis_1 redis-cli -n 1 FLUSHDB && bun test tests/integration/typed-queries-patch.test.ts`
Expected: FAIL — la ruta no existe

- [ ] **Step 3: El validador**

En `src/validators/query.validators.ts`:

```ts
export const patchQuerySchema = z.object({
  subject: subjectSchema.optional(),
  changes: z.array(changeSchema).max(100).optional(),
  answer_space: answerSpaceSchema.optional(),
  question: z.string().min(1).max(10_000).optional(),
  context: z.string().max(100_000).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "nothing to update" });

export type PatchQueryInput = z.infer<typeof patchQuerySchema>;
```

- [ ] **Step 4: El servicio**

En `src/services/query.service.ts`:

```ts
const MAX_CLARIFICATION_ROUNDS = 2;

/**
 * The agent supplying what the human said was missing. Only valid from
 * needs_context, and it goes through admission exactly like a creation does.
 */
export async function updateQuery(queryId: string, agentId: string, input: PatchQueryInput) {
  const db = getDb();

  const [query] = await db
    .select()
    .from(humanQueries)
    .where(and(eq(humanQueries.id, queryId), eq(humanQueries.agentId, agentId)))
    .limit(1);

  if (!query) throw new NotFoundError("Query", queryId);
  if (query.status !== "needs_context") {
    throw new ConflictError(`Query is ${query.status}, so there is nothing to clarify`);
  }

  if (query.clarificationRounds >= MAX_CLARIFICATION_ROUNDS) {
    // Unfreeze on the way out. The clock only pauses while the agent can still
    // act; leaving it paused here would freeze the query for ever.
    await db.update(humanQueries)
      .set({ pausedAt: null, updatedAt: new Date() })
      .where(eq(humanQueries.id, queryId));

    throw new UndecidableQueryError(
      "clarification_rounds_exhausted",
      `This query has already been clarified ${MAX_CLARIFICATION_ROUNDS} times.`,
      "Create a new query instead of clarifying this one again.",
    );
  }

  const subject = (input.subject ?? query.subject) as Subject;
  const answerSpace = (input.answer_space ?? query.answerSpace) as unknown as AnswerSpace;
  const verdict = checkPayload({
    risk: query.risk as Risk,
    subject,
    self_contained: query.selfContained,
    answer_space: answerSpace,
  });
  if (!verdict.admit) {
    throw new UndecidableQueryError(verdict.reason, verdict.detail, verdict.remedy);
  }

  // Give back the time the agent spent holding the turn.
  const pausedMs = query.pausedAt ? Date.now() - query.pausedAt.getTime() : 0;

  const [updated] = await db
    .update(humanQueries)
    .set({
      status: "assigned",
      subject,
      answerSpace,
      changes: input.changes ?? query.changes,
      question: input.question ?? query.question,
      context: input.context ?? query.context,
      expiresAt: new Date(query.expiresAt.getTime() + pausedMs),
      pausedAt: null,
      insufficientReason: null,
      updatedAt: new Date(),
    })
    .where(and(eq(humanQueries.id, queryId), eq(humanQueries.status, "needs_context")))
    .returning();

  if (!updated) throw new ConflictError("Query changed while it was being clarified");

  console.log(`[QUERY] Clarified ${queryId} (round ${query.clarificationRounds})`);
  return updated;
}
```

- [ ] **Step 5: La ruta**

En `src/routes/agent/queries.ts`:

```ts
import { patchQuerySchema } from "../../validators/query.validators";
import { updateQuery } from "../../services/query.service";

app.patch("/:id", validateBody(patchQuerySchema), async (c) => {
  const agentId = c.get("agentId");
  const input = c.get("validatedBody");
  const query = await updateQuery(c.req.param("id"), agentId, input);
  return c.json({ data: query });
});
```

- [ ] **Step 6: Ejecutar, suite, typecheck y commit**

```bash
git add src/validators/query.validators.ts src/services/query.service.ts \
  src/routes/agent/queries.ts tests/integration/typed-queries-patch.test.ts tests/helpers/queries.ts
git commit -m "Let the agent clarify, and give back the paused time

A PATCH from needs_context runs through admission exactly like a creation,
so an agent cannot fix one hole by opening another. The query returns to
assigned with its deadline pushed forward by however long the agent held
the turn.

Two rounds and no more. The cap is enforced on the update rather than by
adding another terminal state, and it unfreezes the clock on the way out -
otherwise an exhausted query would sit paused for ever."
```

---

### Task 8: `cancel` y la carrera contra una respuesta ya emitida

**Files:**
- Modify: `src/services/query.service.ts`
- Modify: `src/routes/agent/queries.ts`
- Create: `tests/integration/typed-queries-cancel.test.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: `cancelQuery(queryId, agentId)`; `POST /api/v1/agent/queries/:id/cancel`.

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/integration/typed-queries-cancel.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { createTestApp } from "../helpers";
import { readyInNeedsContext } from "../helpers/queries";
import { getDb } from "../../src/db";
import { humanQueries } from "../../src/db/schema/human-queries";
import { eq } from "drizzle-orm";

const app = createTestApp();

describe("POST /agent/queries/:id/cancel", () => {
  it("withdraws a query the human has not answered", async () => {
    const { queryId, agentAuth } = await readyInNeedsContext(`c1-${Date.now()}@example.com`);
    const res = await app.request(`/api/v1/agent/queries/${queryId}/cancel`, {
      method: "POST", headers: { Authorization: agentAuth },
    });
    expect(res.status).toBe(200);

    const db = getDb();
    const [row] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));
    expect(row.status).toBe("cancelled");
  });

  // Losing a person's decision to a race is exactly what cannot happen in a
  // system whose value is the record.
  it("loses to an answer that was already given", async () => {
    const { queryId, agentAuth, human } = await readyInNeedsContext(`c2-${Date.now()}@example.com`);

    await app.request(`/api/v1/human/queries/${queryId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: human.authHeader },
      body: JSON.stringify({ outcome: "answer", answer: { kind: "choice", option_ids: ["yes"] } }),
    });

    const res = await app.request(`/api/v1/agent/queries/${queryId}/cancel`, {
      method: "POST", headers: { Authorization: agentAuth },
    });
    expect(res.status).toBe(409);

    const db = getDb();
    const [row] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));
    expect(row.status).toBe("answered");
    expect(row.answer).toEqual({ kind: "choice", option_ids: ["yes"] });
  });

  it("refuses to cancel another agent's query", async () => {
    const { queryId } = await readyInNeedsContext(`c3-${Date.now()}@example.com`);
    const { createTestAgent } = await import("../helpers");
    const stranger = await createTestAgent();
    const res = await app.request(`/api/v1/agent/queries/${queryId}/cancel`, {
      method: "POST", headers: { Authorization: stranger.authHeader },
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `docker exec agentdialog_redis_1 redis-cli -n 1 FLUSHDB && bun test tests/integration/typed-queries-cancel.test.ts`
Expected: FAIL — la ruta no existe

- [ ] **Step 3: El servicio**

```ts
/**
 * The agent withdrawing a question whose context has moved on.
 *
 * A conditional update, so an answer that landed first always wins: losing a
 * person's decision to a race is exactly what cannot happen in a system whose
 * value is the record.
 */
export async function cancelQuery(queryId: string, agentId: string) {
  const db = getDb();

  const [updated] = await db
    .update(humanQueries)
    .set({ status: "cancelled", pausedAt: null, updatedAt: new Date() })
    .where(and(
      eq(humanQueries.id, queryId),
      eq(humanQueries.agentId, agentId),
      inArray(humanQueries.status, ["pending", "assigned", "needs_context"]),
    ))
    .returning();

  if (updated) {
    console.log(`[QUERY] Cancelled ${queryId} by agent ${agentId}`);
    return updated;
  }

  // Nothing changed: either it is not ours, or it already reached a terminal state.
  const [current] = await db
    .select()
    .from(humanQueries)
    .where(and(eq(humanQueries.id, queryId), eq(humanQueries.agentId, agentId)))
    .limit(1);

  if (!current) throw new NotFoundError("Query", queryId);
  throw new ConflictError(`Query is already ${current.status} and cannot be cancelled`);
}
```

- [ ] **Step 4: La ruta**

```ts
app.post("/:id/cancel", async (c) => {
  const agentId = c.get("agentId");
  const query = await cancelQuery(c.req.param("id"), agentId);
  return c.json({ data: query });
});
```

- [ ] **Step 5: Ejecutar, suite, typecheck y commit**

```bash
git add src/services/query.service.ts src/routes/agent/queries.ts \
  tests/integration/typed-queries-cancel.test.ts
git commit -m "Let an agent withdraw a question, and lose the race on purpose

A conditional update, so an answer that landed first always wins and the
agent gets a 409. The other way round would lose a person's decision to a
race, which is precisely what cannot happen in a system whose value is the
record it keeps."
```

---

### Task 9: La tool MCP

**Files:**
- Modify: `src/mcp/server.ts`
- Create: `tests/unit/mcp-query-tool.test.ts`

**Interfaces:**
- Consumes: `createQuerySchema` (Task 4), `answerSpaceSchema` (Task 1).
- Produces: la tool `human_query` con el esquema nuevo, y `respond_query` sin cambios.

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/unit/mcp-query-tool.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { createQuerySchema } from "../../src/validators/query.validators";

/**
 * The MCP tool is the surface agents actually call. Its schema is what an LLM
 * reads to decide what to send, so it has to describe the obligations rather
 * than only the fields.
 */

describe("el contrato que ve un agente", () => {
  it("requires a subject and an answer space", () => {
    const withoutSubject = {
      query_type: "validation", question: "¿Sí?",
      answer_space: { kind: "boolean", labels: { t: "Sí", f: "No" } },
      target_human_email: "a@example.com",
    };
    expect(createQuerySchema.safeParse(withoutSubject).success).toBe(false);
  });

  it("defaults risk to low and self_contained to false", () => {
    const parsed = createQuerySchema.parse({
      query_type: "validation",
      subject: { id: "s", label: "S", body: "x" },
      question: "¿Sí?",
      answer_space: { kind: "boolean", labels: { t: "Sí", f: "No" } },
      target_human_email: "a@example.com",
    });
    expect(parsed.risk).toBe("low");
    expect(parsed.self_contained).toBe(false);
  });

  it("rejects an answer space outside the catalogue", () => {
    const parsed = createQuerySchema.safeParse({
      query_type: "validation",
      subject: { id: "s", label: "S", body: "x" },
      question: "¿Sí?",
      answer_space: { kind: "freeform" },
      target_human_email: "a@example.com",
    });
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `bun test tests/unit/mcp-query-tool.test.ts`
Expected: FAIL — hoy `createQuerySchema` no exige `subject` ni `answer_space`

(Si la Task 4 ya está aplicada, este test pasa desde el principio. En ese caso, escríbelo igualmente: documenta el contrato y protege contra una regresión.)

- [ ] **Step 3: Actualizar la tool**

En `src/mcp/server.ts`, sustituye la descripción y el esquema de `human_query`:

```ts
  server.tool(
    "human_query",
    `Ask a human a question they can actually decide, and get a structured answer back.

WHAT YOU MUST PROVIDE:
- subject: what this is about. A stable id you reuse for the same thing, a label the human will recognise, and a referent they can look at — an attachment, a uri, or inline body. A question about a thing without the thing is refused.
- answer_space: how they answer. Pick one of boolean, choice, scalar, date, text or fields. Free text is only accepted at low risk.
- risk: your honest floor. The system raises it on its own when it sees money or a prior decision; it never lowers it.

WHAT THE SYSTEM DEMANDS OF YOU:
- Above low risk, every branch must say what it causes (consequence / effect).
- If this person already decided about this subject, you must send \`changes\` saying what changed since. The system checks its own records, so omitting it does not help.
- Above medium risk, we must hold the artefact ourselves (attachment or body) and you must send its sha256.

A refusal comes back as 422 with a \`remedy\` field telling you exactly what to add. Read it and retry.

The human may answer, or reply that they lack context — in which case the query returns to you as needs_context and you clarify with PATCH.`,
    {
      query_type: z.enum(["validation", "interpretation", "expert_query", "labeling"])
        .describe("Framing only: how the question is presented to the human"),
      risk: z.enum(["low", "medium", "high", "critical"]).default("low")
        .describe("Your floor. The system may raise it"),
      subject: z.object({
        id: z.string().min(1).max(128).describe("Stable across questions about the same thing"),
        label: z.string().min(1).max(200).describe("What the human will recognise it by"),
        uri: z.string().url().optional(),
        attachments: z.array(z.string().uuid()).max(10).optional(),
        body: z.string().max(100_000).optional(),
        sha256: z.string().optional().describe("Of the referent as you read it; required above medium risk"),
      }),
      self_contained: z.boolean().default(false)
        .describe("True only if the question genuinely is not about any artefact"),
      question: z.string().min(1).max(10_000),
      context: z.string().max(100_000).optional(),
      changes: z.array(z.object({
        path: z.string(), before: z.string(), after: z.string(),
        materiality: z.enum(["minor", "material"]),
      })).optional().describe("Required if this person already decided about this subject"),
      answer_space: answerSpaceSchema.describe("How the human answers. One of the six shapes"),
      target_human_email: z.string().email(),
      confidence: z.number().min(0).max(1).optional(),
      timeout_minutes: z.number().int().min(1).max(10080).default(60),
    },
    async (args, extra) => {
      const agentId = (extra as any).agentId as string;
      if (!agentId) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Authentication required" }) }],
          isError: true,
        };
      }

      try {
        const result = await createQuery(agentId, {
          query_type: args.query_type,
          risk: args.risk,
          subject: args.subject,
          self_contained: args.self_contained,
          question: args.question,
          context: args.context,
          changes: args.changes,
          answer_space: args.answer_space,
          target_human_email: args.target_human_email,
          confidence: args.confidence,
          timeout_minutes: args.timeout_minutes,
        });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err: any) {
        // A refusal is actionable, so hand the agent the whole shape rather than
        // just the message: reason and remedy are what let it retry correctly.
        const payload = err?.code === "UNDECIDABLE_QUERY"
          ? { error: err.message, code: err.code, reason: err.reason,
              remedy: err.remedy, prior_query_id: err.priorQueryId }
          : { error: err.message };
        console.error(`[MCP:TOOL] human_query error for ${agentId}:`, err);
        return { content: [{ type: "text", text: JSON.stringify(payload) }], isError: true };
      }
    },
  );
```

Actualiza también los textos de `statusHints` para incluir los dos estados nuevos, en `query.service.ts`:

```ts
    needs_context: "The human could not decide with what you gave them. Read `insufficient_reason`, then PATCH the query with what is missing. The clock is paused while you do.",
    cancelled: "You withdrew this query. Create a new one if you still need an answer.",
```

- [ ] **Step 4: Ejecutar, suite, typecheck y commit**

```bash
git add src/mcp/server.ts src/services/query.service.ts tests/unit/mcp-query-tool.test.ts
git commit -m "Teach the MCP tool what a decidable question is

The tool description is what an LLM reads before deciding what to send, so
it states the obligations rather than only the fields - including that
omitting the delta does not help, because the system checks its own records
rather than trusting the declaration."
```

---

### Task 10: El SDK y su documentación

Tocar el SDK obliga a actualizar sus documentos **en el mismo cambio**. Es una regla del repositorio y su motivo es que un ejemplo obsoleto es un fallo de confianza para el integrador, que es toda la audiencia del producto.

**Files:**
- Modify: `sdks/typescript/src/queries.ts`
- Modify: `sdks/typescript/package.json` (versión)
- Modify: `sdks/typescript/README.md`
- Modify: `docs-site/content/docs/concepts/queries.mdx`
- Modify: `docs-site/content/docs/api-reference/agent/queries.mdx`
- Modify: `web/src/components/landing/CodeExamples.tsx`
- Modify: `docs/api/README.md` y regenerar `web/public/agentdialog-integration-guide.md`
- Modify: `sdks/typescript/tests/` según haga falta

**Interfaces:**
- Consumes: la forma de wire de las Tasks 4-8.
- Produces: `AnswerSpace`, `Answer`, `Subject`, `Change` en camelCase; `createQuery` acepta `answerSpace`, `subject`, `risk`, `changes`.

- [ ] **Step 1: Ampliar los tipos del SDK**

En `sdks/typescript/src/queries.ts`. La superficie pública es camelCase y traduce
al wire snake_case en el borde, siguiendo lo que el fichero ya hace:

```ts
export type Risk = "low" | "medium" | "high" | "critical";

export interface Subject {
  id: string;
  label: string;
  uri?: string;
  attachments?: string[];
  body?: string;
  sha256?: string;
}

export interface Change {
  path: string;
  before: string;
  after: string;
  materiality: "minor" | "material";
}

// Mirrors the server catalogue. Kept structural rather than imported so the
// package stays dependency-free.
export type AnswerSpace =
  | { kind: "boolean"; labels: { t: string; f: string }; consequences?: { t: string; f: string } }
  | { kind: "choice"; select: "one" | "many";
      options: Array<{ id: string; label: string; consequence?: string }> }
  | { kind: "scalar"; unit: string; min?: number; max?: number; step?: number; effect?: string }
  | { kind: "date"; earliest?: string; latest?: string; effect?: string }
  | { kind: "text"; maxLength: number }
  | { kind: "fields"; fields: Slot[]; effect?: string };

export type Slot = { id: string; label: string; proposed?: unknown } & (
  | { kind: "boolean"; labels: { t: string; f: string } }
  | { kind: "choice"; options: Array<{ id: string; label: string }> }
  | { kind: "scalar"; unit: string; min?: number; max?: number; step?: number }
  | { kind: "date"; earliest?: string; latest?: string }
  | { kind: "text"; maxLength: number }
);

export type Answer =
  | { kind: "boolean"; value: boolean }
  | { kind: "choice"; optionIds: string[] }
  | { kind: "scalar"; value: number }
  | { kind: "date"; value: string }
  | { kind: "text"; value: string }
  | { kind: "fields"; values: Record<string, unknown> };
```

`CreateQueryInput` gana `risk?`, `subject`, `selfContained?`, `changes?` y
`answerSpace`. `Query.answer` y `QuerySummary.answer` pasan de `string | null` a
`Answer | null`, y `QueryStatus` gana `"needs_context"` y `"cancelled"`.

La traducción vive en `toCreateQueryBody` y `fromQueryWire`, que ya existen.
Ojo con las dos formas anidadas que también cambian de caso: `maxLength` ↔
`max_length` y `optionIds` ↔ `option_ids`. Escribe dos ayudantes,
`answerSpaceToWire` y `answerFromWire`, en vez de repetir la conversión.

- [ ] **Step 2: Subir la versión**

`sdks/typescript/package.json`: `0.1.1` → `0.2.0`. Es una ruptura de la superficie pública.

- [ ] **Step 3: Actualizar README, docs-site, landing y la guía**

Sustituye todo ejemplo que muestre `answer` como cadena. Usa clientes **ficticios** — es un repositorio público.

Regenera la guía descargable:

```bash
bash scripts/sync-integration-guide.sh
```

- [ ] **Step 4: Verificar el paquete**

```bash
cd sdks/typescript && bun install && bunx tsc -b && bash scripts/smoke-pack.sh
```

Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add sdks/typescript/ docs-site/ web/ docs/api/README.md
git commit -m "Publish the typed query surface in the SDK, docs and examples

answer stops being a string. Version goes to 0.2.0 because the public
surface breaks.

Docs, the landing examples and the downloadable guide move in the same
commit, as the repository requires: a stale example is a trust failure for
the integrator, who is the entire audience of this product."
```

---

### Task 11: El render en el chat web y en el email

El bloque más grande. Seis formas que renderizar, con valores propuestos en `fields`.

**Files:**
- Modify: `web/src/` — el componente que hoy muestra una query y su respuesta
- Modify: `src/services/query-email.service.ts`

**Interfaces:**
- Consumes: `AnswerSpace`, `Answer` del SDK o de un tipo local equivalente.
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Localizar el componente actual**

```bash
grep -rn "queries\|respond" web/src --include=*.tsx | head -20
```

Trabaja sobre lo que encuentres; sigue los patrones del fichero.

- [ ] **Step 2: Un renderizador por forma**

Crea `web/src/components/answer/` con un componente por forma —`BooleanAnswer`, `ChoiceAnswer`, `ScalarAnswer`, `DateAnswer`, `TextAnswer`, `FieldsAnswer`— y un `AnswerSpaceInput` que despacha por `kind`. Cada uno recibe el espacio y devuelve el `Answer` correspondiente.

`ChoiceAnswer` muestra la **consecuencia junto a cada opción**: es lo que separa esto de un botón de aprobar sin contexto, y sin ella el trabajo del spec no llega al humano.

`FieldsAnswer` rellena cada hueco con su `proposed` y marca visualmente los que el humano ha tocado.

- [ ] **Step 3: Cabecera de contexto**

Sobre la pregunta, muestra `subject.label`, el referente (miniatura del adjunto, enlace del `uri`, o el `body`), y si hay `changes`, una tabla antes/después con los `material` destacados. Si el sistema conoce una decisión previa, muéstrala: *«decidiste sobre esto el …»*.

- [ ] **Step 4: El botón de la tercera salida**

Un control «No tengo contexto suficiente» que abre los cinco motivos cerrados y envía `outcome: "insufficient_context"`.

- [ ] **Step 5: El email**

En `src/services/query-email.service.ts`, el aviso muestra `subject.label` y, si hay `changes`, un resumen de los materiales. **No** intenta renderizar el espacio de respuesta: el email avisa y el humano contesta en la app.

- [ ] **Step 6: Verificar a mano**

```bash
bun run dev    # y en otra terminal: cd web && bun run dev
```

Recorre los cuatro casos de uso del razonamiento: renovación con delta, ticket con `fields`, etiquetado con adjunto, y juicio `self_contained`. Comprueba que las consecuencias se ven junto a cada opción y que la tercera salida funciona.

- [ ] **Step 7: Typecheck y commit**

```bash
cd web && bunx tsc -b
git add web/src src/services/query-email.service.ts
git commit -m "Render the six answer shapes, and show what each one causes

The consequence sits next to its option. Without that the human gets a
tidy button over a question they still cannot decide, which is the
rubber-stamping this whole feature exists to prevent.

The email only notifies: it names the subject and summarises the material
changes, and the answer happens in the app."
```

---

## Cobertura de los criterios de aceptación

| Criterio del spec | Dónde |
|---|---|
| 1. Segunda pregunta sin `changes` → 422; con `changes` → admitida | Task 5 |
| 2. `fields` con propuestas; el humano corrige uno | Tasks 1, 6, 11 |
| 3. Etiquetado sin referente → 422 a cualquier riesgo | Tasks 2, 4 |
| 4. `self_contained` sin referente → admitida | Tasks 2, 4 |
| 5. `text` con `risk: high` → 422 | Tasks 2, 4 |
| 6. `fields` todo texto con `risk: high` → 422 | Tasks 1, 2 |
| 7. `insufficient_context` congela y no cierra; el `PATCH` reanuda | Tasks 6, 7 |
| 8. Tercer `PATCH` → 422 y deja de estar pausada | Task 7 |
| 9. `cancel` sobre una contestada → 409 y la respuesta permanece | Task 8 |
| 10. Fila anterior a la migración se sigue leyendo | Task 3 |

## Fuera de alcance, siguiendo el spec

- Política de atención: presupuesto de interrupciones, franjas horarias, consolidación por expediente, quórum multi-aprobador.
- Registro de decisión: qué se renderizó y cuánto tardó el humano en decidir.
- `superseded`, que deliberadamente no se construye.
- Tests automáticos de la UI: el render de las seis formas se verifica a mano (Task 11, Step 6) y queda como deuda declarada.
