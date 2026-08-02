import { Prisma, type DecisionCategory, type PrismaClient } from "@prisma/client";
import {
  DECISION_CATEGORIES,
  validateSnapshot,
  type EngineRule,
  type RuleSetSnapshot,
} from "@ruleshop/rule-engine";
import { snapshotChecksum } from "@/lib/rules/checksum";
import { CATEGORY_DEFAULTS } from "@/lib/rules/defaults";
import { seedRulesFor, type StoreRuleOptions } from "@/lib/rules/starter-rules";

/**
 * Creates a store's starter rulesets and publishes version 1 of them. Called
 * by the seed and by store creation, both of which need a working engine.
 *
 * Writes the minimum equivalent of a control plane publish, but through the
 * same engine validation, so an invalid starter set errors out instead of
 * slipping broken data into a store. Idempotent: rules are upserted, and a new
 * version is published only when the checksum differs from the active one.
 *
 * `db` is a parameter because the seed has its own client and cannot use the
 * server-only singleton.
 */
export async function provisionStarterRulesets({
  db,
  storeId,
  options,
  changeSummary = "Reguli de start la crearea magazinului.",
}: {
  db: PrismaClient;
  storeId: string;
  options: StoreRuleOptions;
  changeSummary?: string;
}): Promise<{ published: number; categories: number }> {
  const rulesByCategory = seedRulesFor(options);
  let published = 0;

  for (const category of DECISION_CATEGORIES) {
    const defaults = CATEGORY_DEFAULTS[category];
    const starterRules = rulesByCategory[category];

    const ruleSet = await db.ruleSet.upsert({
      where: {
        storeId_category: { storeId, category: category as DecisionCategory },
      },
      create: {
        storeId,
        key: category.toLowerCase(),
        name: category,
        category: category as DecisionCategory,
        conflictStrategy: defaults.conflictStrategy,
        defaultDecision: defaults.defaultDecision as Prisma.InputJsonValue,
      },
      // The strategy and default decision may have been changed in the
      // control plane; re-provisioning must not undo that.
      update: {},
    });

    for (const rule of starterRules) {
      await db.rule.upsert({
        where: { ruleSetId_key: { ruleSetId: ruleSet.id, key: rule.key } },
        create: {
          storeId,
          ruleSetId: ruleSet.id,
          key: rule.key,
          name: rule.name,
          description: rule.description,
          priority: rule.priority,
          status: "ACTIVE",
          enabled: true,
          conditions: rule.conditions as unknown as Prisma.InputJsonValue,
          actions: rule.actions as unknown as Prisma.InputJsonValue,
        },
        update: {
          name: rule.name,
          description: rule.description,
          priority: rule.priority,
          conditions: rule.conditions as unknown as Prisma.InputJsonValue,
          actions: rule.actions as unknown as Prisma.InputJsonValue,
        },
      });
    }

    // Exactly what a control plane publish would produce.
    const engineRules: EngineRule[] = starterRules.map((r) => ({
      key: r.key,
      name: r.name,
      priority: r.priority,
      enabled: true,
      conditions: r.conditions,
      actions: r.actions,
      effectiveFrom: null,
      effectiveTo: null,
    }));

    const lastVersion = await db.ruleVersion.findFirst({
      where: { ruleSetId: ruleSet.id },
      orderBy: { version: "desc" },
      select: { id: true, version: true, checksum: true },
    });

    const snapshot: RuleSetSnapshot = {
      key: ruleSet.key,
      category,
      version: (lastVersion?.version ?? 0) + 1,
      conflictStrategy: ruleSet.conflictStrategy,
      defaultDecision: (ruleSet.defaultDecision ?? {}) as Record<string, unknown>,
      rules: engineRules,
    };

    const errors = validateSnapshot(snapshot).filter(
      (issue) => issue.severity === "error",
    );
    if (errors.length > 0) {
      throw new Error(
        `Reguli de start invalide pentru ${category}:\n` +
          errors.map((e) => `  ${e.path}: ${e.message}`).join("\n"),
      );
    }

    // Same formula as a control plane publish.
    const checksum = snapshotChecksum(snapshot);

    // Nothing to publish: the same content is already active.
    if (
      lastVersion &&
      lastVersion.checksum === checksum &&
      ruleSet.activeVersionId === lastVersion.id
    ) {
      continue;
    }

    const version = await db.ruleVersion.create({
      data: {
        storeId,
        ruleSetId: ruleSet.id,
        version: snapshot.version,
        status: "PUBLISHED",
        publishChannel: "STABLE",
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        diff: {
          added: engineRules.map((r) => r.key),
          removed: [],
          changed: [],
        } as Prisma.InputJsonValue,
        changeSummary,
        checksum,
        publishedAt: new Date(),
      },
      select: { id: true },
    });

    await db.$transaction([
      ...(ruleSet.activeVersionId
        ? [
            db.ruleVersion.update({
              where: { id: ruleSet.activeVersionId },
              data: { status: "SUPERSEDED" },
            }),
          ]
        : []),
      db.ruleSet.update({
        where: { id: ruleSet.id },
        data: { activeVersionId: version.id },
      }),
    ]);
    published += 1;
  }

  return { published, categories: DECISION_CATEGORIES.length };
}
