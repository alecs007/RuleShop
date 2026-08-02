import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { logAudit } from "@/lib/audit";
import { assertAiQuota, generateJson } from "./gemini";

/**
 * The AI receives the incident's signals and context, already computed, and
 * returns an opinion with a confidence and a rationale. The decision stays
 * with the operator: the review flow in /admin/fraud is unchanged.
 */

const PROMPT_VERSION = 1;

export const INCIDENT_CLASSES = [
  "PROBABIL_FRAUDA",
  "PROBABIL_LEGITIM",
  "DATE_INSUFICIENTE",
] as const;
export type IncidentClass = (typeof INCIDENT_CLASSES)[number];

const classificationParser = z.object({
  classification: z.enum(INCIDENT_CLASSES),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1).max(2000),
});

export interface IncidentClassification {
  classification: IncidentClass;
  confidence: number;
  rationale: string;
  model: string;
}

export async function classifyIncident(
  storeId: string,
  incidentId: string,
  actor: { id: string; email: string | null },
): Promise<IncidentClassification> {
  await assertAiQuota(storeId, "classify");

  const incident = await prisma.fraudIncident.findFirst({
    where: { id: incidentId, storeId },
  });
  if (!incident) throw new Error("Incidentul nu există.");

  // The same buyer's history, computed by the app, not the model.
  const [priorIncidents, priorOrders] = await Promise.all([
    prisma.fraudIncident.count({
      where: {
        storeId,
        id: { not: incident.id },
        OR: [
          { sessionKey: incident.sessionKey },
          ...(incident.email ? [{ email: incident.email }] : []),
        ],
      },
    }),
    prisma.order.count({
      where: {
        storeId,
        status: { in: ["PAID", "FULFILLED"] },
        OR: [
          { sessionKey: incident.sessionKey },
          ...(incident.email ? [{ guestEmail: incident.email }] : []),
        ],
      },
    }),
  ]);

  const system = `Ești analistul antifraudă al unui magazin online. Primești un incident (scor, semnale, decizia motorului de reguli, istoric) și emiți O OPINIE de clasificare pentru operatorul uman.
Reguli:
- răspunzi în română, concis, pentru un operator care decide în câteva secunde;
- "classification": PROBABIL_FRAUDA / PROBABIL_LEGITIM / DATE_INSUFICIENTE;
- "confidence" (0..1) — onest; semnale puține sau contradictorii = încredere mică;
- "rationale": ce semnale cântăresc și în ce direcție; NU inventa date;
- opinia ta NU decide nimic: operatorul confirmă sau respinge singur.
Răspunde DOAR cu JSON: { "classification", "confidence", "rationale" }.`;

  const user = JSON.stringify(
    {
      decision: incident.decision,
      riskScore: incident.riskScore,
      riskLevel: incident.riskLevel,
      signals: incident.signals,
      matchedRuleKeys: incident.matchedRuleKeys,
      history: {
        priorIncidents,
        priorPaidOrders: priorOrders,
      },
      createdAt: incident.createdAt,
    },
    null,
    2,
  );

  const result = await generateJson({
    system,
    user,
    parser: classificationParser,
    responseSchema: {
      type: "OBJECT",
      properties: {
        classification: { type: "STRING", enum: [...INCIDENT_CLASSES] },
        confidence: { type: "NUMBER" },
        rationale: { type: "STRING" },
      },
      required: ["classification", "confidence", "rationale"],
    },
    temperature: 0.2,
  });

  await prisma.fraudIncident.update({
    where: { id: incident.id },
    data: {
      aiClassification: result.data.classification,
      aiConfidence: result.data.confidence,
      aiRationale: result.data.rationale,
    },
  });
  await logAudit({
    storeId,
    action: "AI_SUGGESTION_GENERATED",
    entityType: "FraudIncident",
    entityId: incident.id,
    actorId: actor.id,
    actorEmail: actor.email,
    metadata: {
      feature: "incident-classification",
      model: result.model,
      promptVersion: PROMPT_VERSION,
      classification: result.data.classification,
      confidence: result.data.confidence,
    },
  });

  return { ...result.data, model: result.model };
}
