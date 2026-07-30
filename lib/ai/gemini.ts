import "server-only";
import type { z } from "zod";
import { rateLimit } from "@/lib/redis/rate-limit";

/**
 * Providerul IA al platformei — Google Gemini, prin REST (generateContent).
 *
 * Rolul IA in RuleShop este strict consultativ, conform baremului:
 *  - primeste reguli, statistici si metrici CALCULATE de aplicatie;
 *  - propune, explica si clasifica — NU evalueaza niciodata reguli si NU
 *    publica nimic (aprobarea umana este obligatorie in fluxul de sugestii);
 *  - orice raspuns trece prin validare Zod + validarea motorului inainte sa
 *    ajunga in fata administratorului.
 *
 * Iesirea este fortata la JSON prin `responseMimeType` + `responseSchema`
 * (structured output), apoi re-validata local — schema trimisa modelului este
 * o constrangere, nu o garantie.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Alias care urmareste mereu ultimul model Flash stabil — versiunile fixate
// (ex: gemini-2.5-flash) ajung sa dea 404 pentru cheile noi cand se retrag.
const DEFAULT_MODEL = "gemini-flash-latest";
const REQUEST_TIMEOUT_MS = 45_000;

export class AiNotConfiguredError extends Error {
  constructor() {
    super(
      "Modulul AI nu este configurat — setează GEMINI_API_KEY în .env pentru a-l activa.",
    );
    this.name = "AiNotConfiguredError";
  }
}

export class AiRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AiRequestError";
  }
}

export class AiInvalidResponseError extends Error {
  constructor(
    message: string,
    readonly raw?: string,
  ) {
    super(message);
    this.name = "AiInvalidResponseError";
  }
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Plafon pe apelurile AI ale unui magazin — cheile Gemini au cote si costuri,
 * iar un buton apasat in bucla nu trebuie sa le consume. Aruncat inainte de
 * orice apel spre model; UI-ul afiseaza mesajul ca atare.
 */
export async function assertAiQuota(
  storeId: string,
  feature: "analyze" | "generate" | "classify",
): Promise<void> {
  const limits = { analyze: 10, generate: 20, classify: 30 } as const;
  const gate = await rateLimit({
    key: `ai:${feature}:${storeId}`,
    limit: limits[feature],
    windowSeconds: 3600,
  });
  if (!gate.allowed) {
    throw new AiRequestError(
      `Limita de ${limits[feature]} cereri AI pe oră a fost atinsă — reîncearcă în ${Math.ceil(gate.resetSeconds / 60)} minute.`,
    );
  }
}

export function aiModelName(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

export interface AiJsonRequest<T> {
  /** Instructiunile de sistem: rol, constrangeri, format. */
  system: string;
  /** Continutul analizat (reguli, statistici, cerinta utilizatorului). */
  user: string;
  /**
   * Schema JSON (OpenAPI subset) trimisa modelului ca `responseSchema` —
   * tine raspunsul pe forma; validarea reala o face `parser`. Lipsa pentru
   * structurile recursive (arbori de conditii), pe care Gemini nu le poate
   * declara — acolo forma e descrisa in prompt si impusa de Zod + motor.
   */
  responseSchema?: Record<string, unknown>;
  /** Schema Zod care valideaza raspunsul — sursa de adevar. */
  parser: z.ZodType<T>;
  temperature?: number;
}

export interface AiJsonResult<T> {
  data: T;
  model: string;
  /** Raspunsul brut, pastrat pentru trasabilitate/audit. */
  rawText: string;
  latencyMs: number;
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

async function callGemini(
  body: Record<string, unknown>,
  model: string,
  apiKey: string,
): Promise<GeminiResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new AiRequestError(
        `Gemini a răspuns cu ${response.status}: ${text.slice(0, 300)}`,
        response.status,
      );
    }
    return (await response.json()) as GeminiResponse;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiRequestError(
        `Gemini nu a răspuns în ${REQUEST_TIMEOUT_MS / 1000}s.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** O reincercare doar pentru erorile trecatoare (rate limit / server). */
function isRetryable(error: unknown): boolean {
  return (
    error instanceof AiRequestError &&
    (error.status === 429 || (error.status !== undefined && error.status >= 500))
  );
}

/**
 * Cere modelului un raspuns JSON pe schema data si il valideaza cu Zod.
 * Arunca erori tipizate: neconfigurat / cerere esuata / raspuns invalid.
 */
export async function generateJson<T>(request: AiJsonRequest<T>): Promise<AiJsonResult<T>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AiNotConfiguredError();

  const model = aiModelName();
  const body = {
    systemInstruction: { parts: [{ text: request.system }] },
    contents: [{ role: "user", parts: [{ text: request.user }] }],
    generationConfig: {
      temperature: request.temperature ?? 0.2,
      responseMimeType: "application/json",
      ...(request.responseSchema ? { responseSchema: request.responseSchema } : {}),
    },
  };

  const started = Date.now();
  let response: GeminiResponse;
  try {
    response = await callGemini(body, model, apiKey);
  } catch (error) {
    if (!isRetryable(error)) throw error;
    response = await callGemini(body, model, apiKey);
  }

  if (response.promptFeedback?.blockReason) {
    throw new AiInvalidResponseError(
      `Gemini a refuzat cererea: ${response.promptFeedback.blockReason}`,
    );
  }
  const rawText =
    response.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!rawText) {
    throw new AiInvalidResponseError("Gemini a întors un răspuns gol.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    throw new AiInvalidResponseError("Răspunsul Gemini nu este JSON valid.", rawText);
  }

  const validated = request.parser.safeParse(parsedJson);
  if (!validated.success) {
    throw new AiInvalidResponseError(
      `Răspunsul Gemini nu respectă schema: ${validated.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
      rawText,
    );
  }

  return {
    data: validated.data,
    model,
    rawText,
    latencyMs: Date.now() - started,
  };
}
