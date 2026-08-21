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

// .strict() matters here: without it, zod's default "strip" mode would
// silently drop a `consequence` on a nested choice slot instead of rejecting
// it, which is exactly the leak Finding 2 caught.
const choiceSlotOption = choiceOption.omit({ consequence: true }).strict();

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
    z.object({
      kind: z.literal("choice"),
      options: z.array(choiceSlotOption).min(1).max(20),
    }),
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
  // Date.parse rolls an impossible calendar date forward (2026-02-31 becomes
  // 2026-03-03) instead of failing, so a round-trip through ISO is the only
  // way to catch it.
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return bad(`${where}: not a real date`);
  }
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
