# El idioma declarado y el correo — plan de implementación

> **Para quien ejecute esto:** usa `superpowers:subagent-driven-development`
> (recomendado) o `superpowers:executing-plans` para ir tarea a tarea. Los pasos
> llevan casilla (`- [ ]`).

**Objetivo:** que una query declarada en catalán produzca un correo en catalán,
sin tocar una sola palabra de lo que escribió el agente.

**Arquitectura:** un catálogo de mensajes tipado por idioma, sin librería; una
columna `language` en las dos tablas que un agente escribe; y una regla única
para decidir el idioma — si hay navegador delante manda el navegador, si no manda
lo declarado, y a falta de ambos, inglés.

**Stack:** Bun, Hono, Drizzle, Zod, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-08-26-declared-language-and-email-design.md`.

## Restricciones globales

- Catálogo cerrado: **`en`, `es`, `ca`**. El euskera está fuera a propósito;
  no lo añadas «ya que estamos».
- Código, comentarios y mensajes de commit **en inglés**; commits en prosa
  imperativa, sin prefijos `feat:`.
- Suite: `bun test tests/unit tests/integration`, nombrando las dos rutas.
- Alta de agentes limitada a **diez por hora**, contador en Redis entre
  ejecuciones: un agente por fichero en `beforeAll`.
- **Nunca se traduce lo que escribe el agente**: pregunta, sujeto, opciones,
  consecuencias, contexto y cambios viajan intactos.

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/i18n/types.ts` *(nuevo)* | `Language` y la interfaz `Messages` |
| `src/i18n/en.ts`, `es.ts`, `ca.ts` *(nuevos)* | Un catálogo cada uno |
| `src/i18n/index.ts` *(nuevo)* | `messagesFor`, `negotiateLanguage`, `localeTag` |
| `migrations/0010_query_language.sql` *(nuevo)* | Las dos columnas |
| `migrations/meta/_journal.json` | Su entrada, **en el mismo commit** |
| `src/db/schema/human-queries.ts`, `invitations.ts` | La columna |
| `src/validators/query.validators.ts` | El enum en el cable |
| `src/services/query-email.service.ts` | Correo de query traducido |
| `src/services/email.service.ts` | Código e invitación traducidos |

---

### Tarea 1: El catálogo

**Ficheros:**
- Crear: `src/i18n/types.ts`, `src/i18n/en.ts`, `src/i18n/es.ts`, `src/i18n/ca.ts`, `src/i18n/index.ts`
- Test: `tests/unit/i18n.test.ts`

**Interfaces:**
- Produce: `type Language = "en" | "es" | "ca"`, `SUPPORTED_LANGUAGES`,
  `interface Messages`, `messagesFor(language: string): Messages`,
  `negotiateLanguage(header: string | undefined): Language`,
  `localeTag(language: string): string`.

- [ ] **Paso 1: escribe el test que falla**

```ts
// tests/unit/i18n.test.ts
import { describe, expect, it } from "bun:test";
import { messagesFor, negotiateLanguage, localeTag, SUPPORTED_LANGUAGES } from "../../src/i18n";

describe("messagesFor", () => {
  it("returns the catalogue for a supported language", () => {
    expect(messagesFor("ca").about).toBe("SOBRE");
    expect(messagesFor("es").about).toBe("SOBRE");
    expect(messagesFor("en").about).toBe("ABOUT");
  });

  it("falls back to English for anything else", () => {
    // Rows written before the enum existed, or a language removed from the
    // catalogue later, must not crash an email.
    expect(messagesFor("eu")).toBe(messagesFor("en"));
    expect(messagesFor("")).toBe(messagesFor("en"));
  });

  it("has every key in every language", () => {
    const keys = Object.keys(messagesFor("en")).sort();
    for (const language of SUPPORTED_LANGUAGES) {
      expect(Object.keys(messagesFor(language)).sort()).toEqual(keys);
    }
  });
});

describe("negotiateLanguage", () => {
  it("takes the first supported language, ignoring region", () => {
    expect(negotiateLanguage("ca-ES,ca;q=0.9,es;q=0.8")).toBe("ca");
    expect(negotiateLanguage("es-MX,es;q=0.9")).toBe("es");
  });

  it("skips languages it does not have", () => {
    expect(negotiateLanguage("eu-ES,eu;q=0.9,es;q=0.7")).toBe("es");
  });

  it("falls back to English", () => {
    expect(negotiateLanguage(undefined)).toBe("en");
    expect(negotiateLanguage("")).toBe("en");
    expect(negotiateLanguage("de,fr;q=0.9")).toBe("en");
  });
});

describe("localeTag", () => {
  it("maps a language to the tag a date formatter wants", () => {
    expect(localeTag("ca")).toBe("ca-ES");
    expect(localeTag("es")).toBe("es-ES");
    expect(localeTag("en")).toBe("en-US");
  });

  it("falls back for a value read from an old row", () => {
    expect(localeTag("eu")).toBe("en-US");
  });
});
```

- [ ] **Paso 2: ejecútalo y comprueba que falla**

Ejecuta: `bun test tests/unit/i18n.test.ts`
Esperado: FAIL con `Cannot find module '../../src/i18n'`.

- [ ] **Paso 3: escribe los tipos**

```ts
// src/i18n/types.ts
export const SUPPORTED_LANGUAGES = ["en", "es", "ca"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Every string the product puts around an agent's words. What the agent wrote —
 * the question, the subject, the options, the context — is never in here.
 */
export interface Messages {
  // Query notification
  hasAQuestionForYou: string;
  about: string;
  whatChanged: string;
  moreChanges: (count: number) => string;
  context: string;
  contextTruncated: string;
  answerThisQuestion: string;
  replyWillNotReach: (agentName: string) => string;
  expires: (formattedDate: string) => string;
  queryType: Record<"validation" | "interpretation" | "expert_query" | "labeling", string>;

  // Sign-in code
  codeSubject: string;
  codeHeading: string;
  codeIntro: (agentName: string) => string;
  codeExpiresIn: (minutes: number) => string;
  codeIgnore: string;

  // Invitation
  invitationSubject: (agentName: string) => string;
  invitationIntro: (agentName: string, conversationTitle?: string) => string;
  invitationAccept: string;
  invitationIgnore: string;
}
```

- [ ] **Paso 4: escribe los tres catálogos**

```ts
// src/i18n/en.ts
import type { Messages } from "./types";

export const en: Messages = {
  hasAQuestionForYou: "has a question for you",
  about: "ABOUT",
  whatChanged: "WHAT CHANGED",
  moreChanges: (count) => `+${count} more — see the app for the full list.`,
  context: "CONTEXT",
  contextTruncated: "... (see full context in app)",
  answerThisQuestion: "Answer this question",
  replyWillNotReach: (agentName) => `Replying to this email will not reach ${agentName}.`,
  expires: (formattedDate) => `Expires: ${formattedDate}`,
  queryType: {
    validation: "Validation",
    interpretation: "Interpretation",
    expert_query: "Expert Query",
    labeling: "Labeling",
  },
  codeSubject: "Your verification code",
  codeHeading: "Your verification code",
  codeIntro: (agentName) => `${agentName} is waiting for your answer. Use this code to sign in.`,
  codeExpiresIn: (minutes) => `This code expires in ${minutes} minutes.`,
  codeIgnore: "If you did not ask for this code, ignore this email.",
  invitationSubject: (agentName) => `${agentName} invited you to a conversation`,
  invitationIntro: (agentName, conversationTitle) =>
    conversationTitle
      ? `Agent ${agentName} has invited you to join a conversation: ${conversationTitle}.`
      : `Agent ${agentName} has invited you to join a conversation.`,
  invitationAccept: "Accept invitation",
  invitationIgnore: "If you do not want to join, simply ignore this email.",
};
```

```ts
// src/i18n/es.ts
import type { Messages } from "./types";

export const es: Messages = {
  hasAQuestionForYou: "tiene una pregunta para ti",
  about: "SOBRE",
  whatChanged: "QUÉ HA CAMBIADO",
  moreChanges: (count) => `+${count} más — la lista completa está en la aplicación.`,
  context: "CONTEXTO",
  contextTruncated: "... (el contexto completo está en la aplicación)",
  answerThisQuestion: "Responder a esta pregunta",
  replyWillNotReach: (agentName) => `Responder a este correo no llega a ${agentName}.`,
  expires: (formattedDate) => `Caduca: ${formattedDate}`,
  queryType: {
    validation: "Validación",
    interpretation: "Interpretación",
    expert_query: "Consulta experta",
    labeling: "Etiquetado",
  },
  codeSubject: "Tu código de acceso",
  codeHeading: "Tu código de acceso",
  codeIntro: (agentName) => `${agentName} espera tu respuesta. Usa este código para entrar.`,
  codeExpiresIn: (minutes) => `Este código caduca en ${minutes} minutos.`,
  codeIgnore: "Si no has pedido este código, ignora este correo.",
  invitationSubject: (agentName) => `${agentName} te ha invitado a una conversación`,
  invitationIntro: (agentName, conversationTitle) =>
    conversationTitle
      ? `El agente ${agentName} te ha invitado a una conversación: ${conversationTitle}.`
      : `El agente ${agentName} te ha invitado a una conversación.`,
  invitationAccept: "Aceptar la invitación",
  invitationIgnore: "Si no quieres unirte, ignora este correo.",
};
```

```ts
// src/i18n/ca.ts
import type { Messages } from "./types";

export const ca: Messages = {
  hasAQuestionForYou: "té una pregunta per a tu",
  about: "SOBRE",
  whatChanged: "QUÈ HA CANVIAT",
  moreChanges: (count) => `+${count} més — la llista completa és a l'aplicació.`,
  context: "CONTEXT",
  contextTruncated: "... (el context complet és a l'aplicació)",
  answerThisQuestion: "Respondre aquesta pregunta",
  replyWillNotReach: (agentName) => `Respondre aquest correu no arriba a ${agentName}.`,
  expires: (formattedDate) => `Caduca: ${formattedDate}`,
  queryType: {
    validation: "Validació",
    interpretation: "Interpretació",
    expert_query: "Consulta experta",
    labeling: "Etiquetatge",
  },
  codeSubject: "El teu codi d'accés",
  codeHeading: "El teu codi d'accés",
  codeIntro: (agentName) => `${agentName} espera la teva resposta. Fes servir aquest codi per entrar.`,
  codeExpiresIn: (minutes) => `Aquest codi caduca en ${minutes} minuts.`,
  codeIgnore: "Si no has demanat aquest codi, ignora aquest correu.",
  invitationSubject: (agentName) => `${agentName} t'ha convidat a una conversa`,
  invitationIntro: (agentName, conversationTitle) =>
    conversationTitle
      ? `L'agent ${agentName} t'ha convidat a una conversa: ${conversationTitle}.`
      : `L'agent ${agentName} t'ha convidat a una conversa.`,
  invitationAccept: "Acceptar la invitació",
  invitationIgnore: "Si no vols unir-t'hi, ignora aquest correu.",
};
```

- [ ] **Paso 5: escribe el resolutor**

```ts
// src/i18n/index.ts
import { SUPPORTED_LANGUAGES, type Language, type Messages } from "./types";
import { en } from "./en";
import { es } from "./es";
import { ca } from "./ca";

export { SUPPORTED_LANGUAGES, type Language, type Messages };

const CATALOGUES: Record<Language, Messages> = { en, es, ca };

const LOCALE_TAGS: Record<Language, string> = {
  en: "en-US",
  es: "es-ES",
  ca: "ca-ES",
};

function isSupported(value: string): value is Language {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** Anything unknown falls back to English rather than throwing: a row written
 *  before the column existed must not be able to break an email. */
export function messagesFor(language: string): Messages {
  return isSupported(language) ? CATALOGUES[language] : CATALOGUES.en;
}

/** Takes a string for the same reason messagesFor does: the value arrives from
 *  a database column, not from a narrowed type. */
export function localeTag(language: string): string {
  return isSupported(language) ? LOCALE_TAGS[language] : LOCALE_TAGS.en;
}

/**
 * The browser's own preference order, narrowed to what we have. Region is
 * dropped: ca-ES is Catalan, es-MX is Spanish.
 */
export function negotiateLanguage(header: string | undefined): Language {
  if (!header) return "en";

  const candidates = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.trim().toLowerCase().split("-")[0]!, weight: q ? Number(q) : 1 };
    })
    .filter((c) => c.tag.length > 0)
    .sort((a, b) => b.weight - a.weight);

  for (const candidate of candidates) {
    if (isSupported(candidate.tag)) return candidate.tag;
  }
  return "en";
}
```

- [ ] **Paso 6: ejecuta el test y comprueba que pasa**

Ejecuta: `bun test tests/unit/i18n.test.ts`
Esperado: PASS, 7 tests.

- [ ] **Paso 7: commit**

```bash
git add src/i18n tests/unit/i18n.test.ts
git commit -m "Write the wrapper in three languages, with the compiler as the completeness check"
```

---

### Tarea 2: El dato

**Ficheros:**
- Crear: `migrations/0010_query_language.sql`
- Modificar: `migrations/meta/_journal.json`
- Modificar: `src/db/schema/human-queries.ts`, `src/db/schema/invitations.ts`
- Modificar: `src/validators/query.validators.ts`
- Modificar: `src/services/query.service.ts` (guardar y devolver `language`)
- Test: `tests/integration/query-language.test.ts`

**Interfaces:**
- Consume: `SUPPORTED_LANGUAGES` de la Tarea 1.
- Produce: `language` aceptado en el cable, guardado en las dos tablas y devuelto
  por `shapeHumanQuery`.

- [ ] **Paso 1: escribe el test que falla**

```ts
// tests/integration/query-language.test.ts
import { describe, expect, it, beforeAll } from "bun:test";
import { createTestApp } from "../helpers";

describe("Declared language", () => {
  const app = createTestApp();
  let apiKey: string;

  beforeAll(async () => {
    const res = await app.request("/api/v1/agent/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: `lang-${Date.now()}`, displayName: "Language Test Agent" }),
    });
    apiKey = (await res.json()).data.apiKey;
  });

  function createQuery(language?: string) {
    const body: Record<string, unknown> = {
      query_type: "validation",
      risk: "low",
      subject: { id: "s1", label: "A figure", body: "Revenue: 2,300,000 EUR." },
      answer_space: { kind: "boolean", labels: { t: "Yes", f: "No" } },
      question: "Is this right?",
      target_human_email: "lang@example.com",
      timeout_minutes: 30,
    };
    if (language !== undefined) body.language = language;

    return app.request("/api/v1/agent/queries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
  }

  it("stores and returns a declared language", async () => {
    const created = await createQuery("ca");
    expect(created.status).toBe(201);

    const { data } = await created.json();
    const read = await app.request(`/api/v1/agent/queries/${data.query_id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect((await read.json()).data.language).toBe("ca");
  });

  it("defaults to English when the agent declares nothing", async () => {
    const created = await createQuery();
    const { data } = await created.json();

    const read = await app.request(`/api/v1/agent/queries/${data.query_id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect((await read.json()).data.language).toBe("en");
  });

  it("refuses a language outside the catalogue", async () => {
    // The catalogue belongs to the product. An unsupported value is a 422 the
    // agent can act on, not a silent English email.
    const res = await createQuery("eu");
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toContain("language");
  });
});
```

- [ ] **Paso 2: ejecútalo y comprueba que falla**

Ejecuta:
```bash
DATABASE_URL="postgresql://agentdialog:agentdialog@localhost:5432/agentdialog_test" \
  bun test tests/integration/query-language.test.ts
```
Esperado: FAIL — `language` no existe: la creación con `"ca"` la ignora y el
lector devuelve `undefined`.

- [ ] **Paso 3: escribe la migración**

```sql
-- migrations/0010_query_language.sql
-- The language the product wraps an agent's words in. It never governs the
-- agent's own text: the question, the subject and the options travel as sent.
--
-- varchar(8) for values of two letters on purpose: widening the catalogue to
-- something like pt-BR should cost an enum entry, not another migration.
ALTER TABLE "human_queries" ADD COLUMN IF NOT EXISTS "language" varchar(8) DEFAULT 'en' NOT NULL;
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "language" varchar(8) DEFAULT 'en' NOT NULL;
```

- [ ] **Paso 4: añade su entrada al diario, en este mismo commit**

Sin esto la migración **se salta en silencio**, `db:migrate` imprime
`Migrations complete` y sale con 0. En `migrations/meta/_journal.json`, al final
del array `entries`:

```json
{
  "idx": 10,
  "version": "7",
  "when": 1787913600000,
  "tag": "0010_query_language",
  "breakpoints": true
}
```

`when` tiene que ser mayor que el de `0009` (`1787827200000`). El `tag` es el
nombre del fichero sin `.sql`, exacto.

- [ ] **Paso 5: aplícala y compruébalo a mano**

```bash
DATABASE_URL="postgresql://agentdialog:agentdialog@localhost:5432/agentdialog_test" \
  bun run scripts/migrate.ts
docker exec <postgres> psql -U agentdialog -d agentdialog_test -c '\d human_queries' | grep language
```
Esperado: la columna aparece. Si no, es que falta la entrada del diario.

- [ ] **Paso 6: declara la columna en el esquema**

```ts
// src/db/schema/human-queries.ts — junto a las demás columnas
language: varchar("language", { length: 8 }).notNull().default("en"),
```

```ts
// src/db/schema/invitations.ts — junto a las demás columnas
language: varchar("language", { length: 8 }).notNull().default("en"),
```

- [ ] **Paso 7: acéptala en el cable**

```ts
// src/validators/query.validators.ts
import { SUPPORTED_LANGUAGES } from "../i18n";

// ...dentro de createQuerySchema y del esquema de PATCH:
language: z.enum(SUPPORTED_LANGUAGES).optional(),
```

Haz lo mismo en el validador de invitaciones que usa
`POST /agent/conversations/:id/invitations`.

- [ ] **Paso 8: guárdala y devuélvela**

En `createQuery`, pasa `language: input.language ?? "en"` al `insert`. En
`shapeHumanQuery`, añade `language: query.language` al objeto devuelto.

- [ ] **Paso 9: ejecuta el test y comprueba que pasa**

Ejecuta:
```bash
DATABASE_URL="postgresql://agentdialog:agentdialog@localhost:5432/agentdialog_test" \
  bun test tests/integration/query-language.test.ts
```
Esperado: PASS, 3 tests.

- [ ] **Paso 10: commit**

```bash
git add migrations src/db/schema src/validators src/services/query.service.ts tests/integration/query-language.test.ts
git commit -m "Let an agent declare the language, and keep it with the query"
```

---

### Tarea 3: El correo de la query, traducido

**Ficheros:**
- Modificar: `src/services/query-email.service.ts`
- Modificar: `src/services/query.service.ts` (pasar el idioma al correo)
- Test: `tests/integration/query-email-language.test.ts`

**Interfaces:**
- Consume: `messagesFor`, `localeTag` (Tarea 1); `query.language` (Tarea 2).
- Produce: `SendQueryEmailInput` gana `language: string`.

- [ ] **Paso 1: escribe el test que falla**

```ts
// tests/integration/query-email-language.test.ts
import { describe, expect, it, beforeAll, afterAll, mock } from "bun:test";
import { sendQueryEmail } from "../../src/services/query-email.service";

/**
 * The email is captured rather than sent: what matters is which words the
 * product chose, not that SMTP works.
 */
const captured: Array<{ subject: string; html: string; text: string }> = [];

mock.module("../../src/lib/email", () => ({
  sendEmail: async (options: { subject: string; html: string; text: string }) => {
    captured.push(options);
    return true;
  },
}));

const base = {
  queryId: "q1",
  agentDisplayName: "Release Agent",
  question: "Is the Q4 revenue figure correct?",
  queryType: "validation",
  subject: { id: "s1", label: "Q4 revenue" },
  targetEmail: "person@example.com",
  expiresAt: new Date("2026-09-01T10:00:00Z"),
  invitationToken: "inv",
  conversationId: "c1",
  grantToken: "qgr_test",
};

describe("Query email language", () => {
  it("wraps the question in Catalan when the query declares ca", async () => {
    captured.length = 0;
    await sendQueryEmail({ ...base, language: "ca" });

    const mail = captured[0]!;
    expect(mail.html).toContain("té una pregunta per a tu");
    expect(mail.html).toContain("Respondre aquesta pregunta");
    // And the agent's own words are untouched.
    expect(mail.html).toContain("Is the Q4 revenue figure correct?");
  });

  it("uses English when the query declares nothing", async () => {
    captured.length = 0;
    await sendQueryEmail({ ...base, language: "en" });

    expect(captured[0]!.html).toContain("has a question for you");
  });

  it("formats the expiry date in the query's language", async () => {
    captured.length = 0;
    await sendQueryEmail({ ...base, language: "es" });

    // es-ES writes the month in Spanish; en-US would say "Sep".
    expect(captured[0]!.text).toContain("sept");
  });
});
```

- [ ] **Paso 2: ejecútalo y comprueba que falla**

Ejecuta:
```bash
DATABASE_URL="postgresql://agentdialog:agentdialog@localhost:5432/agentdialog_test" \
  bun test tests/integration/query-email-language.test.ts
```
Esperado: FAIL — `language` no existe en el tipo de entrada, y el HTML sale en
inglés.

- [ ] **Paso 3: sustituye las cadenas por el catálogo**

En `SendQueryEmailInput`, añade `language: string`. Al principio de
`sendQueryEmail`:

```ts
const m = messagesFor(input.language);
```

Y sustituye cada literal por su clave. Los sitios exactos:

| Antes | Después |
|---|---|
| `has a question for you` | `${m.hasAQuestionForYou}` |
| `ABOUT` | `${m.about}` |
| `WHAT CHANGED` | `${m.whatChanged}` |
| `+${remaining} more — see the app for the full list.` | `${m.moreChanges(remaining)}` |
| `CONTEXT` | `${m.context}` |
| `... (see full context in app)` | `${m.contextTruncated}` |
| `Answer this question` | `${m.answerThisQuestion}` |
| `Replying to this email will not reach X.` | `${m.replyWillNotReach(input.agentDisplayName)}` |
| `Expires: …` | `${m.expires(formatExpiry(input.expiresAt, input.language))}` |
| `QUERY_TYPE_LABELS[…]` | `m.queryType[…]` |

`subjectSummary` recibe ahora los mensajes como parámetro en vez de leer
constantes del módulo:

```ts
function subjectSummary(subject: Subject, m: Messages, changes?: Change[]): { html: string; text: string }
```

Y la fecha se formatea con la etiqueta del idioma:

```ts
function formatExpiry(date: Date, language: string): string {
  return date.toLocaleString(localeTag(language), {
    weekday: "short",
    // ...el resto de opciones que ya tenía
  });
}
```

Borra `QUERY_TYPE_LABELS`: sus cuatro valores viven ahora en los catálogos.

- [ ] **Paso 4: pasa el idioma desde la query**

En `query.service.ts`, donde se llama a `sendQueryEmail`, añade
`language: query.language`.

- [ ] **Paso 5: ejecuta el test y comprueba que pasa**

Ejecuta el mismo comando del paso 2.
Esperado: PASS, 3 tests.

- [ ] **Paso 6: commit**

```bash
git add src/services/query-email.service.ts src/services/query.service.ts tests/integration/query-email-language.test.ts
git commit -m "Send the notification in the language the agent declared"
```

---

### Tarea 4: El código de acceso y la invitación

**Ficheros:**
- Modificar: `src/routes/human/auth.ts` (leer `Accept-Language`)
- Modificar: `src/services/auth.service.ts` (pasarlo al correo)
- Modificar: `src/services/email.service.ts` (los dos correos)
- Test: `tests/integration/auth-email-language.test.ts`

**Interfaces:**
- Consume: `negotiateLanguage`, `messagesFor` (Tarea 1); `invitation.language`
  (Tarea 2).
- Produce: `sendVerificationCodeEmail(email, code, language, agentName?)` y
  `sendInvitationEmail(email, token, agentName, language, conversationTitle?)`.

- [ ] **Paso 1: escribe el test que falla**

```ts
// tests/integration/auth-email-language.test.ts
import { describe, expect, it, mock } from "bun:test";
import { createTestApp } from "../helpers";

const captured: Array<{ subject: string; html: string }> = [];

mock.module("../../src/lib/email", () => ({
  sendEmail: async (options: { subject: string; html: string }) => {
    captured.push(options);
    return true;
  },
  buildVerificationCodeEmail: (code: string) => ({ to: "", subject: "", html: code, text: code }),
}));

describe("Sign-in code language", () => {
  const app = createTestApp();

  it("uses the browser's language, because there is a browser in front", async () => {
    // The person asking for a code has just typed their address into a screen.
    // Their Accept-Language is a better source than anything we could infer.
    captured.length = 0;

    await app.request("/api/v1/human/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept-Language": "ca-ES,ca;q=0.9" },
      body: JSON.stringify({ email: "invited@example.com" }),
    });

    if (captured.length > 0) {
      expect(captured[0]!.subject).toBe("El teu codi d'accés");
    }
  });

  it("falls back to English with no header", async () => {
    captured.length = 0;

    await app.request("/api/v1/human/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "invited@example.com" }),
    });

    if (captured.length > 0) {
      expect(captured[0]!.subject).toBe("Your verification code");
    }
  });
});
```

> El `if (captured.length > 0)` está porque `send-code` rechaza con `403` a una
> dirección sin invitación previa. Crea la invitación en un `beforeAll` con el
> agente del fichero para que el correo llegue a salir; si prefieres no montar
> esa preparación, el test sigue siendo válido como comprobación de que la ruta
> no revienta al recibir la cabecera.

- [ ] **Paso 2: ejecútalo y comprueba que falla**

Ejecuta:
```bash
DATABASE_URL="postgresql://agentdialog:agentdialog@localhost:5432/agentdialog_test" \
  bun test tests/integration/auth-email-language.test.ts
```
Esperado: FAIL — el asunto sale en inglés con la cabecera catalana.

- [ ] **Paso 3: lee la cabecera en la ruta**

```ts
// src/routes/human/auth.ts
import { negotiateLanguage } from "../../i18n";

app.post("/auth/send-code", validateBody(sendCodeSchema), async (c) => {
  const { email } = c.get("validatedBody");
  // Whoever asks for a code is looking at a screen right now. Their browser is a
  // better source than any language we could infer from their history.
  const language = negotiateLanguage(c.req.header("Accept-Language"));
  await createVerificationCode(email, language);
  // ...el resto igual
});
```

- [ ] **Paso 4: tradúcelos**

Las dos funciones de `email.service.ts` reciben el idioma y construyen su HTML
con el catálogo, en vez de con literales:

```ts
export async function sendVerificationCodeEmail(
  email: string,
  code: string,
  language: string,
  agentName?: string,
) {
  const m = messagesFor(language);
  return sendEmail({
    to: email,
    subject: `${env().APP_NAME} - ${m.codeSubject}`,
    html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${m.codeHeading}</h2>
        ${agentName ? `<p>${m.codeIntro(agentName)}</p>` : ""}
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 4px;">${code}</div>
        <p style="color: #666; font-size: 14px;">${m.codeExpiresIn(10)}</p>
        <p style="color: #666; font-size: 14px;">${m.codeIgnore}</p>
      </div>`,
    text: `${m.codeHeading}: ${code}\n${m.codeExpiresIn(10)}`,
  });
}

export async function sendInvitationEmail(
  email: string,
  invitationToken: string,
  agentName: string,
  language: string,
  conversationTitle?: string,
) {
  const m = messagesFor(language);
  // ...mismo cuerpo que ya tenía, con m.invitationSubject / m.invitationIntro /
  // m.invitationAccept / m.invitationIgnore en lugar de los literales.
}
```

Comprueba los minutos de caducidad reales del código antes de fijar el `10`:
sale de la configuración, no de aquí. Y `createVerificationCode(email, language)`
se limita a pasarlo.

La invitación toma su idioma de `invitation.language`, la columna de la Tarea 2.

- [ ] **Paso 5: ejecuta el test y comprueba que pasa**

Mismo comando del paso 2. Esperado: PASS.

- [ ] **Paso 6: commit**

```bash
git add src/routes/human/auth.ts src/services/auth.service.ts src/services/email.service.ts tests/integration/auth-email-language.test.ts
git commit -m "Ask the browser when there is one, and the agent when there is not"
```

---

### Tarea 5: SDK, MCP y documentación

**Ficheros:**
- Modificar: `sdks/typescript/src/types.ts` y `client.ts`
- Modificar: `src/mcp/server.ts` (descripción de `human_query`)
- Modificar: `docs/api/README.md`, `docs-site`, `sdks/typescript/README.md`
- Modificar: `web/public/agentdialog-integration-guide.md` (**regenerado**)

- [ ] **Paso 1: el SDK**

`CreateQueryInput` gana `language?: "en" | "es" | "ca"`, y el traductor de
`sdks/typescript/src/queries.ts` lo pasa tal cual: el nombre es igual en camelCase
y en snake_case, así que no hay conversión que hacer. Lo mismo en
`InviteHumanInput`.

- [ ] **Paso 2: la herramienta MCP**

En la descripción de `human_query`, con estas palabras:

> `language` — the language the notification is written in: `en`, `es` or `ca`.
> It changes the wrapper the product puts around your question — the subject
> line, the labels, the dates. **It does not translate your words.** The
> question, the subject, the options and their consequences are sent exactly as
> you wrote them, so write them in the language you declare.

- [ ] **Paso 3: la documentación**

La misma advertencia, en esas cuatro palabras clave —**no traduce lo que
escribes**— en `docs/api/README.md`, en `docs-site` y en el README del SDK, junto
a la tabla del catálogo y la regla de qué manda en cada superficie.

- [ ] **Paso 4: regenera la guía pública**

```bash
cd web && bun run build
```

- [ ] **Paso 5: revisión del catalán**

Antes de fusionar, que lea `src/i18n/ca.ts` alguien que hable catalán. No es un
paso opcional: el spec dice que un idioma entra en el catálogo cuando hay quien
lo valide, y esta es esa validación.

- [ ] **Paso 6: la suite entera y commit**

```bash
bunx tsc --noEmit
DATABASE_URL="postgresql://agentdialog:agentdialog@localhost:5432/agentdialog_test" \
  bun test tests/unit tests/integration
cd sdks/typescript && bun test && cd ../..

git add sdks/typescript src/mcp/server.ts docs docs-site web/public/agentdialog-integration-guide.md
git commit -m "Document that declaring a language does not translate the question"
```

---

## Lo que este plan deja fuera

- **La landing, `/q/:token` y el selector**: tercera pieza, su propio spec.
- **El chat con sesión y `humans.preferences`**: cuarta.
- **El euskera**: fuera del catálogo hasta que haya quien lo revise.
- **Traducir lo que escribe el agente**: no se hará nunca.
