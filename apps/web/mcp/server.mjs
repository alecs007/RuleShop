#!/usr/bin/env node
/**
 * Serverul MCP al platformei RuleShop.
 *
 * Expune capabilitatile de analiza si asistenta ale control plane-ului ca
 * tool-uri MCP (stdio), astfel incat orice client MCP (Claude Code, alt agent)
 * poate opera analiza regulilor, simularea pe istoric si generarea de reguli.
 *
 * Arhitectura: serverul NU atinge baza de date — vorbeste cu aplicatia prin
 * API-ul /api/v1 autorizat cu tokenul de serviciu (MCP_API_TOKEN). Astfel
 * toate garantiile raman in aplicatie: validarea regulilor, izolarea
 * multi-tenant, auditul si aprobarea umana obligatorie (nimic nu se publica
 * prin MCP — sugestiile devin cel mult DRAFT-uri).
 *
 * Pornire:  pnpm mcp
 * Env:      RULESHOP_URL (implicit http://localhost:3000)
 *           MCP_API_TOKEN (obligatoriu — acelasi din .env-ul aplicatiei)
 *           RULESHOP_STORE (slug-ul magazinului; implicit magazinul activ)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = process.env.RULESHOP_URL ?? "http://localhost:3000";
const TOKEN = process.env.MCP_API_TOKEN;
const STORE = process.env.RULESHOP_STORE;

const CATEGORIES = ["PRICING", "SHIPPING", "FRAUD", "AVAILABILITY", "LOYALTY", "THEME"];

if (!TOKEN) {
  console.error("[ruleshop-mcp] Lipsește MCP_API_TOKEN — setează-l în mediu.");
  process.exit(1);
}

/** Apel autenticat spre API-ul aplicatiei; erorile devin mesaje lizibile. */
async function api(path, { method = "GET", body } = {}) {
  const url = new URL(`/api/v1${path}`, BASE_URL);
  if (STORE) url.searchParams.set("store", STORE);

  const response = await fetch(url, {
    method,
    headers: {
      "x-api-key": TOKEN,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Răspuns neașteptat (${response.status}) de la ${path}`);
  }
  if (!response.ok) {
    throw new Error(json.error ?? `Eroare ${response.status} la ${path}`);
  }
  return json;
}

function asText(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function asError(error) {
  return {
    isError: true,
    content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
  };
}

const server = new McpServer({ name: "ruleshop", version: "1.0.0" });

server.registerTool(
  "list_rules",
  {
    title: "Listează regulile",
    description:
      "Regulile magazinului (cu explicația în limbaj natural, starea și statisticile de utilizare din evaluări reale), plus starea fiecărui ruleset. Opțional filtrate pe categorie.",
    inputSchema: {
      category: z.enum(CATEGORIES).optional().describe("Categoria de decizie"),
    },
  },
  async ({ category }) => {
    try {
      return asText(await api(`/rules${category ? `?category=${category}` : ""}`));
    } catch (error) {
      return asError(error);
    }
  },
);

server.registerTool(
  "simulate_history",
  {
    title: "Simulează pe istoric",
    description:
      "Simulează draftul curent al unei categorii față de versiunea activă, pe evenimente de evaluare REALE. Metricile sunt calculate de aplicație cu propriul motor de reguli — fără IA.",
    inputSchema: {
      category: z.enum(CATEGORIES).describe("Categoria de decizie"),
      limit: z.number().int().min(1).max(2000).optional().describe("Câte evenimente (implicit 1000)"),
    },
  },
  async ({ category, limit }) => {
    try {
      return asText(await api("/ai/simulate", { method: "POST", body: { category, limit } }));
    } catch (error) {
      return asError(error);
    }
  },
);

server.registerTool(
  "analyze_rules",
  {
    title: "Analizează regulile cu IA",
    description:
      "Rulează analiza IA (Gemini) a unui ruleset: reguli nefolosite/redundante, propuneri de praguri/priorități/reguli noi, cu încredere și impact estimat. Sugestiile sunt persistate și așteaptă aprobarea umană în control plane — nimic nu se publică automat.",
    inputSchema: {
      category: z.enum(CATEGORIES).describe("Categoria de decizie"),
    },
  },
  async ({ category }) => {
    try {
      return asText(await api("/ai/analyze", { method: "POST", body: { category } }));
    } catch (error) {
      return asError(error);
    }
  },
);

server.registerTool(
  "generate_rule",
  {
    title: "Generează o regulă din limbaj natural",
    description:
      "Transformă o cerință de business în regulă structurată, validată de motorul aplicației. Implicit doar propune (dryRun); cu dryRun=false salvează un DRAFT nepublicat, pe care un om îl publică din control plane.",
    inputSchema: {
      category: z.enum(CATEGORIES).describe("Categoria de decizie"),
      request: z.string().min(10).max(1000).describe("Cerința, în limbaj natural"),
      dryRun: z.boolean().optional().describe("Implicit true — doar propunerea, fără DRAFT"),
    },
  },
  async ({ category, request, dryRun }) => {
    try {
      return asText(
        await api("/ai/generate-rule", {
          method: "POST",
          body: { category, request, dryRun: dryRun ?? true },
        }),
      );
    } catch (error) {
      return asError(error);
    }
  },
);

server.registerTool(
  "list_suggestions",
  {
    title: "Listează sugestiile IA",
    description:
      "Sugestiile produse de analizele IA, cu statusul lor (propuse / acceptate / respinse / invalide) și trasabilitatea completă (model, încredere).",
    inputSchema: {
      category: z.enum(CATEGORIES).optional().describe("Categoria de decizie"),
    },
  },
  async ({ category }) => {
    try {
      return asText(await api(`/ai/suggestions${category ? `?category=${category}` : ""}`));
    } catch (error) {
      return asError(error);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[ruleshop-mcp] pornit — API: ${BASE_URL}${STORE ? `, magazin: ${STORE}` : ""}`);
