import "server-only";
import type { z } from "zod";
import { POLICIES, rateLimit } from "@/lib/rate-limit";

/**
 * The AI provider: Google Gemini over REST. Its role is strictly advisory — it
 * receives rules and metrics the application computed, and proposes, explains
 * or classifies. It never evaluates rules and never publishes anything.
 *
 * Output is constrained to JSON with `responseSchema` and then re-validated
 * locally: the schema sent to the model is a constraint, not a guarantee.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// An alias that tracks the latest stable Flash model: pinned versions start
// 404ing for new keys once they are retired.
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
 * Thrown before any call to the model: Gemini keys have quotas and cost money,
 * and a button held down must not burn through them.
 */
export async function assertAiQuota(
  storeId: string,
  feature: "analyze" | "generate" | "classify",
): Promise<void> {
  const policy = {
    analyze: "aiAnalyze",
    generate: "aiGenerate",
    classify: "aiClassify",
  } as const;

  const gate = await rateLimit(policy[feature], storeId);
  if (!gate.allowed) {
    const perHour = POLICIES[policy[feature]].limit;
    throw new AiRequestError(
      `Limita de ${perHour} cereri AI pe oră a fost atinsă — reîncearcă în ${Math.ceil(gate.retryAfterSeconds / 60)} minute.`,
    );
  }
}

export function aiModelName(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

export interface AiJsonRequest<T> {
  /** System instructions: role, constraints, format. */
  system: string;
  /** The content being analysed. */
  user: string;
  /**
   * Sent as `responseSchema` to keep the answer in shape; `parser` does the
   * real validation. Absent for recursive structures, which Gemini cannot
   * declare — there the shape is described in the prompt and enforced by Zod.
   */
  responseSchema?: Record<string, unknown>;
  /** The source of truth for the response's shape. */
  parser: z.ZodType<T>;
  temperature?: number;
}

export interface AiJsonResult<T> {
  data: T;
  model: string;
  /** Kept for traceability and the audit log. */
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

/** One retry, and only for transient errors. */
function isRetryable(error: unknown): boolean {
  return (
    error instanceof AiRequestError &&
    (error.status === 429 || (error.status !== undefined && error.status >= 500))
  );
}

/** Asks for JSON on the given schema and validates it with Zod. */
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
