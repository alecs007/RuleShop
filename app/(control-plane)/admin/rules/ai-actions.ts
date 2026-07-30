"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin, requireStaff } from "@/lib/auth/guards";
import { DECISION_CATEGORIES, type DecisionCategory } from "@/lib/engine";
import { getOrCreateRuleSet } from "@/lib/rules/service";
import {
  AiInvalidResponseError,
  AiNotConfiguredError,
  AiRequestError,
} from "@/lib/ai/gemini";
import { runRulesetAnalysis } from "@/lib/ai/analysis";
import { acceptSuggestion, rejectSuggestion } from "@/lib/ai/suggestions";
import {
  createDraftFromProposal,
  generateRuleProposal,
} from "@/lib/ai/generate-rule";
import { classifyIncident } from "@/lib/ai/classify-incident";

/**
 * Actiunile server ale modulului IA. Toate cer rol de admin/staff verificat pe
 * server si niciuna nu publica reguli: rezultatele IA devin cel mult DRAFT-uri
 * sau opinii afisate, iar publicarea ramane fluxul manual existent.
 */

function parseCategory(raw: unknown): DecisionCategory {
  const value = String(raw ?? "").toUpperCase() as DecisionCategory;
  if (!DECISION_CATEGORIES.includes(value)) redirect("/admin/rules");
  return value;
}

/** Mesaj prietenos pentru erorile providerului IA. */
function aiErrorMessage(error: unknown): string {
  if (
    error instanceof AiNotConfiguredError ||
    error instanceof AiRequestError ||
    error instanceof AiInvalidResponseError
  ) {
    return error.message;
  }
  console.error("[ai] eroare neasteptata:", error);
  return "Modulul AI a întâmpinat o eroare neașteptată. Încearcă din nou.";
}

export interface AiActionState {
  ok: boolean;
  message?: string;
  issues?: string[];
}

// ---------------------------------------------------------------------------
// Analiza rulesetului
// ---------------------------------------------------------------------------

export async function runAiAnalysisAction(
  category: string,
  _prev: AiActionState | undefined,
  _formData: FormData,
): Promise<AiActionState> {
  const { user, storeId } = await requireAdmin();
  const cat = parseCategory(category);

  try {
    const run = await runRulesetAnalysis(storeId, cat, {
      id: user.id,
      email: user.email,
    });
    revalidatePath("/admin/rules", "layout");
    return {
      ok: true,
      message:
        run.suggestions.length === 0
          ? "Analiza nu a găsit nimic de îmbunătățit."
          : `Analiza a produs ${run.suggestions.length} ${run.suggestions.length === 1 ? "sugestie" : "sugestii"} — examinează-le mai jos.`,
    };
  } catch (error) {
    return { ok: false, message: aiErrorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Decizia umana asupra sugestiilor
// ---------------------------------------------------------------------------

export async function acceptSuggestionAction(formData: FormData): Promise<void> {
  const { user, storeId } = await requireAdmin();
  const suggestionId = formData.get("suggestionId");
  if (typeof suggestionId !== "string" || !suggestionId) return;

  const result = await acceptSuggestion(storeId, suggestionId, {
    id: user.id,
    email: user.email,
  });
  if (!result.ok) throw new Error(result.message);
  revalidatePath("/admin/rules", "layout");
}

export async function rejectSuggestionAction(formData: FormData): Promise<void> {
  const { user, storeId } = await requireAdmin();
  const suggestionId = formData.get("suggestionId");
  if (typeof suggestionId !== "string" || !suggestionId) return;

  const result = await rejectSuggestion(storeId, suggestionId, {
    id: user.id,
    email: user.email,
  });
  if (!result.ok) throw new Error(result.message);
  revalidatePath("/admin/rules", "layout");
}

// ---------------------------------------------------------------------------
// Generarea unei reguli din limbaj natural
// ---------------------------------------------------------------------------

export async function generateAiRuleAction(
  category: string,
  _prev: AiActionState | undefined,
  formData: FormData,
): Promise<AiActionState> {
  const { user, storeId } = await requireAdmin();
  const cat = parseCategory(category);

  const request = String(formData.get("request") ?? "").trim();
  if (request.length < 10) {
    return { ok: false, message: "Descrie regula în cel puțin câteva cuvinte." };
  }
  if (request.length > 1000) {
    return { ok: false, message: "Descrierea este prea lungă (max 1000 caractere)." };
  }

  const ruleSet = await getOrCreateRuleSet(storeId, cat);
  const existing = await prisma.rule.findMany({
    where: { ruleSetId: ruleSet.id },
    select: { key: true },
  });

  let proposal;
  try {
    proposal = await generateRuleProposal({
      storeId,
      category: cat,
      request,
      existingRuleKeys: existing.map((r) => r.key),
    });
  } catch (error) {
    return { ok: false, message: aiErrorMessage(error) };
  }

  if (proposal.issues.some((i) => i.severity === "error")) {
    return {
      ok: false,
      message: "Regula generată nu a trecut validarea motorului — reformulează cerința.",
      issues: proposal.issues
        .filter((i) => i.severity === "error")
        .map((i) => `${i.path}: ${i.message}`),
    };
  }

  // Regula intra ca DRAFT, cu sursa si motivatia IA — un om o verifica in
  // editor si tot un om o publica. Nimic nu ajunge automat in magazin.
  const { ruleId } = await createDraftFromProposal({
    storeId,
    category: cat,
    proposal,
    request,
    actor: { id: user.id, email: user.email },
  });

  revalidatePath("/admin/rules", "layout");
  redirect(`/admin/rules/${cat.toLowerCase()}/${ruleId}?generated=1`);
}

// ---------------------------------------------------------------------------
// Clasificarea unui incident antifrauda
// ---------------------------------------------------------------------------

export async function classifyIncidentAction(
  _prev: AiActionState | undefined,
  formData: FormData,
): Promise<AiActionState> {
  const { user, storeId } = await requireStaff();
  const incidentId = formData.get("incidentId");
  if (typeof incidentId !== "string" || !incidentId) {
    return { ok: false, message: "Cerere invalidă." };
  }

  try {
    await classifyIncident(storeId, incidentId, {
      id: user.id,
      email: user.email,
    });
    revalidatePath("/admin/fraud");
    return { ok: true, message: "Opinia AI a fost adăugată incidentului." };
  } catch (error) {
    return { ok: false, message: aiErrorMessage(error) };
  }
}
