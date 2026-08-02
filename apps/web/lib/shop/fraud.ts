import "server-only";
import { headers } from "next/headers";
import { Prisma, type FraudDecision, type RiskLevel } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getActiveRuleset } from "@/lib/rules/service";
import { recordEvaluation } from "@/lib/rules/evaluation-log";
import {
  assessFraud,
  explainAssessment,
  type FraudAssessment,
  type FraudOrderFacts,
  type FraudSessionFacts,
} from "@ruleshop/storefront";
import type { CartShippingFacts } from "@ruleshop/storefront";

export type { FraudAssessment } from "@ruleshop/storefront";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface RequestFingerprint {
  ipAddress: string | null;
  userAgent: string | null;
  ipCountry: string | null;
}

/**
 * The country comes from the proxy or CDN; locally it stays null, since real
 * geolocation would need an external service.
 */
export async function readRequestFingerprint(): Promise<RequestFingerprint> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return {
    ipAddress: forwarded?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null,
    userAgent: h.get("user-agent"),
    ipCountry:
      h.get("cf-ipcountry") ??
      h.get("x-vercel-ip-country") ??
      h.get("x-country-code"),
  };
}

export interface SignalSubject {
  storeId: string;
  sessionKey: string;
  userId: string | null;
  email: string | null;
}

/**
 * History signals read from the database. The client cannot influence them,
 * which is exactly why they are read on the server and not taken from a form.
 */
export async function collectSessionSignals(
  subject: SignalSubject,
  fingerprint: RequestFingerprint,
  isAuthenticated: boolean,
): Promise<FraudSessionFacts> {
  const now = Date.now();
  // The identities that track the same buyer: session, account, email.
  const identity: Prisma.OrderWhereInput = {
    storeId: subject.storeId,
    OR: [
      { sessionKey: subject.sessionKey },
      ...(subject.userId ? [{ userId: subject.userId }] : []),
      ...(subject.email ? [{ guestEmail: subject.email }] : []),
    ],
  };

  const [ordersLastHour, ordersLastDay, priorBlocks, priorReviews, user] =
    await Promise.all([
      prisma.order.count({
        where: { ...identity, createdAt: { gte: new Date(now - HOUR_MS) } },
      }),
      prisma.order.count({
        where: { ...identity, createdAt: { gte: new Date(now - DAY_MS) } },
      }),
      prisma.fraudIncident.count({
        where: {
          storeId: subject.storeId,
          decision: "BLOCK",
          OR: [
            { sessionKey: subject.sessionKey },
            ...(subject.userId ? [{ userId: subject.userId }] : []),
            ...(subject.email ? [{ email: subject.email }] : []),
          ],
        },
      }),
      prisma.fraudIncident.count({
        where: {
          storeId: subject.storeId,
          decision: "REVIEW",
          OR: [
            { sessionKey: subject.sessionKey },
            ...(subject.userId ? [{ userId: subject.userId }] : []),
            ...(subject.email ? [{ email: subject.email }] : []),
          ],
        },
      }),
      subject.userId
        ? prisma.user.findUnique({
            where: { id: subject.userId },
            select: { createdAt: true },
          })
        : null,
    ]);

  return {
    isGuest: !isAuthenticated,
    isAuthenticated,
    ipCountry: fingerprint.ipCountry,
    ordersLastHour,
    ordersLastDay,
    priorBlocks,
    priorReviews,
    accountAgeDays: user
      ? Math.floor((now - user.createdAt.getTime()) / DAY_MS)
      : 0,
  };
}

export interface FraudCheckInput {
  storeId: string;
  cart: CartShippingFacts;
  customer: Record<string, unknown>;
  session: FraudSessionFacts;
  order: FraudOrderFacts;
}

/** Runs the fraud check for the current request. */
export async function checkFraud(
  input: FraudCheckInput,
): Promise<FraudAssessment> {
  const ruleset = await getActiveRuleset(input.storeId, "FRAUD");
  const facts = {
    cart: {
      subtotalCents: input.cart.subtotalCents,
      itemCount: input.cart.itemCount,
      categories: input.cart.categories,
      weightGrams: input.cart.weightGrams,
    },
    customer: input.customer,
    session: input.session,
    order: input.order,
  };
  const assessment = assessFraud({
    snapshot: ruleset?.snapshot ?? null,
    killSwitch: ruleset?.killSwitch,
    facts,
  });

  // Every real check is recorded: thresholds are simulated on these.
  if (ruleset && !ruleset.killSwitch) {
    recordEvaluation({
      storeId: input.storeId,
      category: "FRAUD",
      context: facts as unknown as Record<string, unknown>,
      decision: {
        riskScore: assessment.riskScore,
        decision: assessment.decision,
        riskLevel: assessment.riskLevel,
        decisionSource: assessment.decisionSource,
        signals: assessment.flaggedSignals,
      },
      matchedRuleKeys: assessment.matchedRules,
      rulesetVersion: assessment.rulesetVersion ?? 0,
      traceId: assessment.traceId,
      usedDefault: assessment.matchedRules.length === 0,
      source: "checkout",
    });
  }

  return assessment;
}

export interface RecordIncidentInput {
  storeId: string;
  orderId: string | null;
  userId: string | null;
  sessionKey: string;
  email: string | null;
  fingerprint: RequestFingerprint;
  assessment: FraudAssessment;
  session: FraudSessionFacts;
  order: FraudOrderFacts;
}

/**
 * Only recorded when the rules reacted, or the log would fill with clean
 * attempts. Incidents are also the data set the AI classifies.
 */
export async function recordFraudIncident(
  input: RecordIncidentInput,
): Promise<string | null> {
  const { assessment } = input;
  if (assessment.decision === "ALLOW" && assessment.riskScore === 0)
    return null;

  const incident = await prisma.fraudIncident.create({
    data: {
      storeId: input.storeId,
      orderId: input.orderId,
      userId: input.userId,
      sessionKey: input.sessionKey,
      email: input.email,
      ipAddress: input.fingerprint.ipAddress,
      userAgent: input.fingerprint.userAgent,
      riskScore: assessment.riskScore,
      riskLevel: assessment.riskLevel as RiskLevel,
      decision: assessment.decision as FraudDecision,
      signals: {
        flagged: assessment.flaggedSignals,
        // The facts behind the decision, as the engine saw them.
        facts: { session: input.session, order: input.order },
      } as unknown as Prisma.InputJsonValue,
      matchedRuleKeys: assessment.matchedRules,
      rulesetVersion: assessment.rulesetVersion,
      traceId: assessment.traceId,
      explanation: {
        summary: explainAssessment(assessment),
        decisionSource: assessment.decisionSource,
        thresholds: assessment.thresholds,
        trace: assessment.trace,
      } as unknown as Prisma.InputJsonValue,
      // Incidents that merely passed need no human review.
      reviewStatus: assessment.decision === "ALLOW" ? "DISMISSED" : "OPEN",
    },
    select: { id: true },
  });
  return incident.id;
}
