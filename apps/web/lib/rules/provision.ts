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
 * Creeaza rulesetele de start ale unui magazin si publica versiunea 1 din ele.
 *
 * Doi apelanti: seed-ul demonstrativ (`prisma/seed.ts`) si crearea unui magazin
 * din control plane. Ambele au nevoie de un magazin cu motorul deja functional,
 * deci logica sta aici, o singura data.
 *
 * Publicarea normala (din control plane) trece prin `lib/rules/service.ts`, cu
 * diff, simulare si audit. Aici se scrie minimul echivalent — dar snapshotul
 * trece prin ACEEASI validare a motorului, deci un set de start invalid se
 * opreste cu eroare in loc sa strecoare date stricate in magazin.
 *
 * Idempotent: regulile se fac upsert pe [ruleSetId, key], iar o versiune noua se
 * publica doar cand checksumul difera de al versiunii active.
 *
 * `db` e parametru pentru ca seed-ul isi are propriul client (nu poate folosi
 * singletonul din `lib/db/prisma`, care e „server-only").
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
      // Strategia si decizia implicita se pot fi schimbat din control plane —
      // o re-provizionare nu trebuie sa le anuleze.
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

    // Snapshotul candidat: exact ce ar produce publicarea din control plane.
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

    // Aceeasi formula ca la publicarea din control plane.
    const checksum = snapshotChecksum(snapshot);

    // Nimic nou de publicat: acelasi conținut e deja activ.
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
