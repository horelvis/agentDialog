import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { a2aProjectShares } from "../db/schema/a2a-project-shares";
import { agentProjects } from "../db/schema/agent-projects";
import { agentProjectParticipants } from "../db/schema/agent-project-participants";
import { agents } from "../db/schema/agents";
import { NotFoundError, ForbiddenError, UnauthorizedError } from "../lib/errors";
import { hashToken, verifyToken } from "../lib/crypto";
import {
  generateProjectShareToken,
  projectShareTokenPrefix,
} from "../lib/a2a/project-contract-token";
import {
  buildProjectContract,
  contractParticipant,
  type ProjectContract,
} from "../lib/a2a/project-contract";

/**
 * The project's collaboration contract and the capability that reads it.
 *
 * The lead defines the rules (project.metadata.rules) and controls the share:
 * generating the token mints a fresh one, regenerating it rotates it and the
 * previous one stops working. The token is stored the way query grants are — an
 * indexed prefix plus a bcrypt hash — so it never sits in plaintext on disk.
 */

export interface ProjectShareResult {
  token: string;
  shareUrl: string;
}

export function buildShareUrl(apiBaseUrl: string, projectId: string, token: string): string {
  return `${apiBaseUrl.replace(/\/$/, "")}/a2a/projects/${projectId}/contract?token=${token}`;
}

async function assertLeadAgent(projectId: string, agentId: string) {
  const db = getDb();
  const [project] = await db.select().from(agentProjects).where(eq(agentProjects.id, projectId)).limit(1);
  if (!project) throw new NotFoundError("Project", projectId);
  if (project.leadAgentId !== agentId) throw new ForbiddenError("Only the project lead can do this");
  return project;
}

async function upsertShare(projectId: string, apiBaseUrl: string): Promise<ProjectShareResult> {
  const db = getDb();
  const token = generateProjectShareToken();

  await db.transaction(async (tx) => {
    await tx.delete(a2aProjectShares).where(eq(a2aProjectShares.projectId, projectId));
    await tx.insert(a2aProjectShares).values({
      projectId,
      tokenPrefix: projectShareTokenPrefix(token),
      tokenHash: await hashToken(token),
    });
  });

  return { token, shareUrl: buildShareUrl(apiBaseUrl, projectId, token) };
}

/** Mint (or rotate) the project's share. Lead only. */
export async function createProjectShare(
  projectId: string,
  leadAgentId: string,
  apiBaseUrl: string,
): Promise<ProjectShareResult> {
  await assertLeadAgent(projectId, leadAgentId);
  return upsertShare(projectId, apiBaseUrl);
}

/** Rotate the project's share. Lead only; the previous token stops working. */
export async function rotateProjectShare(
  projectId: string,
  leadAgentId: string,
  apiBaseUrl: string,
): Promise<ProjectShareResult> {
  return createProjectShare(projectId, leadAgentId, apiBaseUrl);
}

/**
 * Save the collaboration rules the lead wrote in Markdown. The hub stores the
 * document and serves it inside the contract; the contract's structured fields
 * are derived from the project state and never come from here.
 */
export async function setProjectContractRules(
  projectId: string,
  leadAgentId: string,
  markdown: string,
): Promise<void> {
  const db = getDb();
  const project = await assertLeadAgent(projectId, leadAgentId);

  const trimmed = markdown.trim();
  await db
    .update(agentProjects)
    .set({ contractRules: trimmed.length > 0 ? trimmed : null, updatedAt: new Date() })
    .where(eq(agentProjects.id, project.id));
}

/**
 * Resolve a share token to the project contract it may read. Every failure is
 * the same UnauthorizedError so the endpoint does not tell strangers which
 * projects exist.
 */
export async function resolveProjectContract(
  token: string,
  projectId: string,
  apiBaseUrl: string,
): Promise<ProjectContract> {
  const db = getDb();

  const [share] = await db
    .select()
    .from(a2aProjectShares)
    .where(
      and(
        eq(a2aProjectShares.projectId, projectId),
        eq(a2aProjectShares.tokenPrefix, projectShareTokenPrefix(token)),
      ),
    )
    .limit(1);

  if (!share) throw new UnauthorizedError("This share link is not valid");
  const valid = await verifyToken(token, share.tokenHash);
  if (!valid) throw new UnauthorizedError("This share link is not valid");

  const [project] = await db.select().from(agentProjects).where(eq(agentProjects.id, projectId)).limit(1);
  if (!project) throw new NotFoundError("Project", projectId);

  const rows = await db
    .select({
      participant: agentProjectParticipants,
      slug: agents.slug,
      displayName: agents.displayName,
    })
    .from(agentProjectParticipants)
    .innerJoin(agents, eq(agents.id, agentProjectParticipants.agentId))
    .where(eq(agentProjectParticipants.projectId, projectId));

  const base = apiBaseUrl.replace(/\/$/, "");
  const leadRow = rows.find((r) => r.participant.agentId === project.leadAgentId);

  const lead = leadRow
    ? contractParticipant({
        slug: leadRow.slug,
        displayName: leadRow.displayName,
        role: leadRow.participant.role,
        status: leadRow.participant.status,
        apiBaseUrl: base,
      })
    : null;

  if (!lead) throw new NotFoundError("Project lead participant", project.leadAgentId);

  const participants = rows
    .filter((r) => r.participant.agentId !== project.leadAgentId)
    .map((r) =>
      contractParticipant({
        slug: r.slug,
        displayName: r.displayName,
        role: r.participant.role,
        status: r.participant.status,
        apiBaseUrl: base,
      }),
    );

  return buildProjectContract({ project, lead, participants, apiBaseUrl: base });
}