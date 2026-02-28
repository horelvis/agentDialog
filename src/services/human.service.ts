import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { humans } from "../db/schema/humans";
import { NotFoundError } from "../lib/errors";
import type { HumanUpdateInput } from "../validators/human.validators";

export async function getOrCreateHuman(email: string) {
  const db = getDb();
  const [existing] = await db.select().from(humans).where(eq(humans.email, email)).limit(1);
  if (existing) return existing;

  const [human] = await db.insert(humans).values({ email }).returning();
  return human;
}

export async function getHumanById(id: string) {
  const db = getDb();
  const [human] = await db.select().from(humans).where(eq(humans.id, id)).limit(1);
  if (!human) throw new NotFoundError("Human", id);
  return human;
}

export async function getHumanByEmail(email: string) {
  const db = getDb();
  const [human] = await db.select().from(humans).where(eq(humans.email, email)).limit(1);
  return human || null;
}

export async function updateHuman(id: string, input: HumanUpdateInput) {
  const db = getDb();
  const [human] = await db
    .update(humans)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(humans.id, id))
    .returning();
  if (!human) throw new NotFoundError("Human", id);
  return human;
}
