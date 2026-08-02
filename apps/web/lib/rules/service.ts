import "server-only";
import { cache } from "react";
import { Prisma, type RuleSet, type User } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { logAudit } from "@/lib/audit";
import {
  validateSnapshot,
  type DecisionCategory,
  type ConflictStrategy,
  type EngineRule,
  type RuleSetSnapshot,
  type ValidationIssue,
} from "@ruleshop/rule-engine";
import { snapshotChecksum } from "./checksum";
import { CATEGORY_DEFAULTS } from "./defaults";
import { getEvaluationEvents } from "./evaluation-log";
import { compareSnapshots, type SimulationComparison } from "./simulation";

/** How many historical events the publish-time simulation replays. */
const PUBLISH_SIMULATION_EVENTS = 500;

export async function getOrCreateRuleSet(
  storeId: string,
  category: DecisionCategory,
): Promise<RuleSet> {
  const existing = await prisma.ruleSet.findUnique({
    where: { storeId_category: { storeId, category } },
  });
  if (existing) return existing;

  const defaults = CATEGORY_DEFAULTS[category];
  return prisma.ruleSet.create({
    data: {
      storeId,
      key: category.toLowerCase(),
      name: category,
      category,
      conflictStrategy: defaults.conflictStrategy,
      defaultDecision: defaults.defaultDecision as Prisma.InputJsonValue,
    },
  });
}

/** Builds the EngineRules from the ruleset's active, enabled rules. */
async function buildEngineRules(ruleSetId: string): Promise<EngineRule[]> {
  const rules = await prisma.rule.findMany({
    where: { ruleSetId, enabled: true, status: { in: ["ACTIVE", "DRAFT"] } },
    orderBy: { priority: "desc" },
  });
  return rules.map((r) => ({
    key: r.key,
    name: r.name,
    priority: r.priority,
    enabled: r.enabled,
    conditions: r.conditions as unknown as EngineRule["conditions"],
    actions: r.actions as unknown as EngineRule["actions"],
    effectiveFrom: r.effectiveFrom?.toISOString() ?? null,
    effectiveTo: r.effectiveTo?.toISOString() ?? null,
  }));
}


/** Structured diff between two snapshots, keyed by rule. */
function diffSnapshots(
  prev: RuleSetSnapshot | null,
  next: RuleSetSnapshot,
): Record<string, string[]> {
  const prevMap = new Map((prev?.rules ?? []).map((r) => [r.key, r]));
  const nextMap = new Map(next.rules.map((r) => [r.key, r]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const key of nextMap.keys()) {
    if (!prevMap.has(key)) added.push(key);
    else if (JSON.stringify(prevMap.get(key)) !== JSON.stringify(nextMap.get(key)))
      changed.push(key);
  }
  for (const key of prevMap.keys()) {
    if (!nextMap.has(key)) removed.push(key);
  }
  return { added, removed, changed };
}

export interface PublishResult {
  ok: boolean;
  version?: number;
  issues?: ValidationIssue[];
  message?: string;
}

/**
 * The candidate snapshot: the current rules, drafts included, exactly as they
 * would look if published now. The control plane tester compares against it.
 */
export async function buildCandidateSnapshot(
  storeId: string,
  category: DecisionCategory,
): Promise<RuleSetSnapshot> {
  const ruleSet = await getOrCreateRuleSet(storeId, category);
  const lastVersion = await prisma.ruleVersion.findFirst({
    where: { ruleSetId: ruleSet.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return {
    key: ruleSet.key,
    category,
    version: (lastVersion?.version ?? 0) + 1,
    conflictStrategy: ruleSet.conflictStrategy as ConflictStrategy,
    defaultDecision: (ruleSet.defaultDecision ?? {}) as Record<string, unknown>,
    rules: await buildEngineRules(ruleSet.id),
  };
}

/**
 * Publishes the current rules as an immutable version and activates it. The
 * storefront changes behaviour immediately, without a deploy.
 */
export async function publishVersion(
  storeId: string,
  category: DecisionCategory,
  actor: User,
): Promise<PublishResult> {
  const ruleSet = await getOrCreateRuleSet(storeId, category);
  const engineRules = await buildEngineRules(ruleSet.id);

  const lastVersion = await prisma.ruleVersion.findFirst({
    where: { ruleSetId: ruleSet.id },
    orderBy: { version: "desc" },
  });
  const nextVersion = (lastVersion?.version ?? 0) + 1;

  const snapshot: RuleSetSnapshot = {
    key: ruleSet.key,
    category,
    version: nextVersion,
    conflictStrategy: ruleSet.conflictStrategy as ConflictStrategy,
    defaultDecision: (ruleSet.defaultDecision ?? {}) as Record<string, unknown>,
    rules: engineRules,
  };

  // An invalid snapshot must never reach production.
  const issues = validateSnapshot(snapshot).filter((i) => i.severity === "error");
  if (issues.length > 0) {
    return { ok: false, issues, message: "Snapshot invalid — corectează regulile." };
  }

  const checksum = snapshotChecksum(snapshot);
  if (lastVersion?.checksum === checksum && ruleSet.activeVersionId === lastVersion.id) {
    return { ok: false, message: "Nicio modificare față de versiunea publicată." };
  }

  const prevSnapshot = lastVersion
    ? (lastVersion.snapshot as unknown as RuleSetSnapshot)
    : null;

  // How the new version would have behaved against the active one, over real
  // evaluations. Computed here and frozen onto the version.
  const activeSnapshot = ruleSet.activeVersionId
    ? (((await prisma.ruleVersion.findUnique({
        where: { id: ruleSet.activeVersionId },
        select: { snapshot: true },
      }))?.snapshot ?? null) as RuleSetSnapshot | null)
    : null;
  const events = await getEvaluationEvents(storeId, category, PUBLISH_SIMULATION_EVENTS);
  const simulation: SimulationComparison | null = events.length
    ? compareSnapshots(
        activeSnapshot,
        snapshot,
        events.map((e) => ({ context: e.context as Record<string, unknown> })),
      )
    : null;

  const version = await prisma.ruleVersion.create({
    data: {
      storeId,
      ruleSetId: ruleSet.id,
      version: nextVersion,
      status: "PUBLISHED",
      publishChannel: "STABLE",
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      diff: diffSnapshots(prevSnapshot, snapshot) as Prisma.InputJsonValue,
      checksum,
      simulationMetrics: (simulation ?? {}) as unknown as Prisma.InputJsonValue,
      createdById: actor.id,
      publishedById: actor.id,
      publishedAt: new Date(),
    },
  });

  await prisma.$transaction([
    // The previous version becomes historical.
    ...(ruleSet.activeVersionId
      ? [
          prisma.ruleVersion.update({
            where: { id: ruleSet.activeVersionId },
            data: { status: "SUPERSEDED" },
          }),
        ]
      : []),
    prisma.ruleSet.update({
      where: { id: ruleSet.id },
      data: { activeVersionId: version.id },
    }),
    // The published rules become ACTIVE.
    prisma.rule.updateMany({
      where: { ruleSetId: ruleSet.id, status: "DRAFT", enabled: true },
      data: { status: "ACTIVE" },
    }),
  ]);

  await logAudit({
    storeId,
    action: "VERSION_PUBLISHED",
    entityType: "RuleVersion",
    entityId: version.id,
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    after: { category, version: nextVersion, diff: version.diff },
  });

  return { ok: true, version: nextVersion };
}

/** Rollback repoints the active version; nothing is deleted. */
export async function rollbackToVersion(
  storeId: string,
  versionId: string,
  actor: User,
): Promise<{ ok: boolean; message?: string }> {
  const version = await prisma.ruleVersion.findFirst({
    where: { id: versionId, storeId },
    include: { ruleSet: true },
  });
  if (!version) return { ok: false, message: "Versiunea nu există." };
  if (version.ruleSet.activeVersionId === version.id) {
    return { ok: false, message: "Versiunea este deja activă." };
  }

  await prisma.$transaction([
    ...(version.ruleSet.activeVersionId
      ? [
          prisma.ruleVersion.update({
            where: { id: version.ruleSet.activeVersionId },
            data: { status: "ROLLED_BACK", rolledBackAt: new Date() },
          }),
        ]
      : []),
    prisma.ruleVersion.update({
      where: { id: version.id },
      data: { status: "PUBLISHED" },
    }),
    prisma.ruleSet.update({
      where: { id: version.ruleSetId },
      data: { activeVersionId: version.id },
    }),
  ]);

  await logAudit({
    storeId,
    action: "VERSION_ROLLED_BACK",
    entityType: "RuleVersion",
    entityId: version.id,
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    after: { category: version.ruleSet.category, version: version.version },
  });

  return { ok: true };
}

export async function setKillSwitch(
  storeId: string,
  category: DecisionCategory,
  on: boolean,
  actor: User,
  reason?: string,
): Promise<void> {
  const ruleSet = await getOrCreateRuleSet(storeId, category);
  await prisma.ruleSet.update({
    where: { id: ruleSet.id },
    data: {
      killSwitch: on,
      killSwitchReason: on ? (reason ?? null) : null,
      killSwitchAt: on ? new Date() : null,
    },
  });
  await logAudit({
    storeId,
    action: on ? "KILL_SWITCH_ON" : "KILL_SWITCH_OFF",
    entityType: "RuleSet",
    entityId: ruleSet.id,
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    metadata: { category, reason },
  });
}

export interface ActiveRuleset {
  snapshot: RuleSetSnapshot;
  killSwitch: boolean;
}

/**
 * The active snapshot for a category, or null if nothing was published.
 *
 * Read straight from the database, deduplicated per request by `cache()` in
 * the `lib/shop/` callers. A Redis cache would save a few milliseconds but
 * open a window where the storefront still serves the previous version after
 * a publish — exactly the guarantee this project rests on.
 */
export async function getActiveRuleset(
  storeId: string,
  category: DecisionCategory,
): Promise<ActiveRuleset | null> {
  const ruleSet = await prisma.ruleSet.findUnique({
    where: { storeId_category: { storeId, category } },
    include: { activeVersion: true },
  });
  if (!ruleSet?.activeVersion) return null;
  return {
    snapshot: ruleSet.activeVersion.snapshot as unknown as RuleSetSnapshot,
    killSwitch: ruleSet.killSwitch,
  };
}

/**
 * Rule key -> name. Published snapshots carry only keys, so explanations read
 * the names from here.
 */
export const getRuleNames = cache(
  async (storeId: string): Promise<Map<string, string>> => {
    const rules = await prisma.rule.findMany({
      where: { storeId },
      select: { key: true, name: true },
    });
    return new Map(rules.map((r) => [r.key, r.name]));
  },
);
