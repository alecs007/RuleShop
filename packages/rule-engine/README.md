# ⚙️ @ruleshop/rule-engine

Motorul de reguli din RuleShop, implementat fără biblioteci de rule engine.
Primește un snapshot de reguli și un context de fapte și întoarce decizia
împreună cu explicația ei. Nu accesează baza de date, nu execută operații de I/O
și nu evaluează cod, deci rulează identic pe server, în teste și în simulări pe
evenimente istorice.

```ts
import { evaluateRuleSet } from "@ruleshop/rule-engine";

const snapshot = {
  key: "pricing",
  category: "PRICING",
  version: 7,
  conflictStrategy: "BEST_FOR_CUSTOMER",
  defaultDecision: { discountPercent: 0 },
  rules: [
    {
      key: "vip-discount",
      name: "Reducere VIP",
      priority: 100,
      enabled: true,
      conditions: {
        type: "group",
        op: "AND",
        children: [
          { type: "condition", fact: "customer.loyaltyTier", operator: "eq", value: "VIP" },
          { type: "condition", fact: "cart.totalCents", operator: "gte", value: 20000 },
        ],
      },
      actions: [{ type: "APPLY_PERCENT_DISCOUNT", params: { percent: 15 } }],
    },
  ],
};

const result = evaluateRuleSet(snapshot, {
  customer: { loyaltyTier: "VIP" },
  cart: { totalCents: 24900 },
});

result.decision;     // { discountPercent: 15 }
result.matchedRules; // ["vip-discount"]
result.trace;        // condiție cu condiție, cu valorile găsite
```

## 🧩 Modelul unei reguli

O condiție este un arbore `AND` / `OR` / `NOT` cu frunze de forma
`(fapt, operator, valoare)`; o acțiune este un tip cu parametri. Faptele sunt căi
dot-notation în contextul de evaluare (`customer.*`, `cart.*`, `product.*`,
`session.*`); un fapt lipsă face condiția falsă, niciodată excepție.

Operatorii declară tipurile de fapt compatibile, iar acțiunile aparțin unei
singure categorii de decizie. Ambele sunt verificate la validare.

## ⚖️ Rezolvarea conflictelor

Se alege per ruleset:

| Strategie               | Comportament                                                  |
| ----------------------- | ------------------------------------------------------------- |
| `PRIORITY_FIRST_MATCH`  | Câștigă regula cu prioritatea cea mai mare                     |
| `PRIORITY_ALL_MATCHES`  | Se aplică toate; prioritatea mare are ultimul cuvânt           |
| `MOST_SPECIFIC`         | Câștigă regula cu cele mai multe condiții                      |
| `BEST_FOR_CUSTOMER`     | Câștigă cea mai avantajoasă pentru client, după scor pe categorie |

Kill switch-ul întoarce direct `defaultDecision`, fără evaluare. Același rezultat
apare când nu se potrivește nicio regulă, semnalat prin `usedDefault: true`.

## ✅ Validare

`validateSnapshot()` rulează înainte de publicare și verifică forma datelor
(Zod), existența și compatibilitatea operatorilor cu tipul valorii, apartenența
acțiunilor la categoria rulesetului, încadrarea parametrilor, cheile duplicate și
ferestrele de valabilitate inversate.

Rezultatele sunt clasificate `error` și `warning`. Avertismentele, precum două
reguli cu aceeași prioritate sub `PRIORITY_FIRST_MATCH`, nu blochează publicarea.

## 📦 Module

| Modul          | Rol                                                                    |
| -------------- | ---------------------------------------------------------------------- |
| `types.ts`     | Snapshot, regulă, condiții, acțiuni, rezultat, trace                   |
| `operators.ts` | Catalogul de operatori, tipat pe tipul faptului                        |
| `evaluate.ts`  | Rezolvarea faptelor și evaluarea arborelui de condiții                 |
| `actions.ts`   | Catalogul de acțiuni per categorie și aplicarea lor                    |
| `engine.ts`    | Orchestrarea: eligibilitate, potrivire, conflicte, decizie             |
| `schemas.ts`   | Validare structurală și semantică                                      |
| `canary.ts`    | Împărțirea deterministă în cohorte                                     |

```bash
pnpm --filter @ruleshop/rule-engine test
```
