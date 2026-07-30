import "server-only";
import { headers } from "next/headers";
import { Prisma, type FraudDecision, type RiskLevel } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getActiveRuleset } from "@/lib/rules/service";
import {
  assessFraud,
  explainAssessment,
  type FraudAssessment,
  type FraudOrderFacts,
  type FraudSessionFacts,
} from "./fraud-risk";
import type { CartShippingFacts } from "./shipping-quote";

export type { FraudAssessment } from "./fraud-risk";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface RequestFingerprint {
  ipAddress: string | null;
  userAgent: string | null;
  ipCountry: string | null;
}

/**
 * Citeste IP-ul, user agent-ul si tara din headerele cererii.
 * Tara vine de la proxy/CDN (Cloudflare, Vercel); local rămâne null —
 * geolocalizarea reala ar cere un serviciu extern.
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
 * Semnalele de istoric, calculate din baza de date (viteza comenzilor,
 * incidente anterioare, vechimea contului). Sunt fapte pe care clientul nu le
 * poate influenta — de aceea se citesc pe server, nu se primesc din formular.
 */
export async function collectSessionSignals(
  subject: SignalSubject,
  fingerprint: RequestFingerprint,
  isAuthenticated: boolean,
): Promise<FraudSessionFacts> {
  const now = Date.now();
  // Identitatile prin care urmarim acelasi cumparator: sesiunea, contul, emailul.
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

/** Ruleaza verificarea antifrauda pentru cererea curenta. */
export async function checkFraud(
  input: FraudCheckInput,
): Promise<FraudAssessment> {
  const ruleset = await getActiveRuleset(input.storeId, "FRAUD");
  return assessFraud({
    snapshot: ruleset?.snapshot ?? null,
    killSwitch: ruleset?.killSwitch,
    facts: {
      cart: {
        subtotalCents: input.cart.subtotalCents,
        itemCount: input.cart.itemCount,
        categories: input.cart.categories,
        weightGrams: input.cart.weightGrams,
      },
      customer: input.customer,
      session: input.session,
      order: input.order,
    },
  });
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
 * Persista incidentul antifrauda. Se inregistreaza doar cand regulile au
 * reactionat (decizie diferita de ALLOW sau scor > 0) — altfel istoricul s-ar
 * umple cu tentative curate. Incidentele sunt si setul de date pe care
 * modulul IA va clasifica tiparele.
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
        // Faptele care au produs decizia, exact cum au intrat in motor.
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
      // Incidentele care doar au trecut nu au nevoie de verificare umana.
      reviewStatus: assessment.decision === "ALLOW" ? "DISMISSED" : "OPEN",
    },
    select: { id: true },
  });
  return incident.id;
}
