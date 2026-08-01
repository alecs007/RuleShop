import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AiInvalidResponseError,
  AiNotConfiguredError,
  AiRequestError,
  generateJson,
  isAiConfigured,
} from "@/lib/ai/gemini";

const parser = z.object({ answer: z.string(), confidence: z.number() });

function geminiResponse(text: string, status = 200) {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status },
  );
}

const request = {
  system: "sistem",
  user: "intrebare",
  parser,
};

describe("providerul Gemini", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fara cheie: neconfigurat si eroare tipizata", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(isAiConfigured()).toBe(false);
    await expect(generateJson(request)).rejects.toBeInstanceOf(AiNotConfiguredError);
  });

  it("raspuns valid: parsat, validat si insotit de trasabilitate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => geminiResponse('{"answer":"da","confidence":0.8}')),
    );

    const result = await generateJson(request);

    expect(result.data).toEqual({ answer: "da", confidence: 0.8 });
    expect(result.model).toBeTruthy();
    expect(result.rawText).toContain('"answer"');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("JSON invalid: eroare de raspuns, cu textul brut pastrat", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => geminiResponse("nu e json")));

    await expect(generateJson(request)).rejects.toBeInstanceOf(AiInvalidResponseError);
  });

  it("JSON pe alta schema: respins de validarea Zod", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => geminiResponse('{"answer":42,"confidence":"mare"}')),
    );

    await expect(generateJson(request)).rejects.toBeInstanceOf(AiInvalidResponseError);
  });

  it("eroare 500: o singura reincercare, apoi succes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))
      .mockResolvedValueOnce(geminiResponse('{"answer":"ok","confidence":1}'));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateJson(request);

    expect(result.data.answer).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("eroare 400: fara reincercare, eroare de cerere", async () => {
    const fetchMock = vi.fn(async () => new Response("bad", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateJson(request)).rejects.toBeInstanceOf(AiRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cerere blocata de model: eroare cu motivul blocarii", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), {
            status: 200,
          }),
      ),
    );

    await expect(generateJson(request)).rejects.toThrow(/SAFETY/);
  });
});
