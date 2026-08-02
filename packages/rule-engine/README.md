# ⚙️ @ruleshop/rule-engine

The RuleShop rule engine, implemented without any rule engine library.
It receives a rule snapshot and a fact context and returns the decision together
with its explanation. It does not touch the database, performs no I/O and
evaluates no code, so it runs identically on the server, in tests and in
simulations over historical events.

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
      name: "VIP discount",
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
result.trace;        // condition by condition, with the values found
```

## 🧩 The rule model

A condition is an `AND` / `OR` / `NOT` tree with leaves of the form
`(fact, operator, value)`; an action is a type with parameters. Facts are
dot-notation paths into the evaluation context (`customer.*`, `cart.*`,
`product.*`, `session.*`); a missing fact makes the condition false, never an
exception.

Operators declare the fact types they are compatible with, and actions belong to
a single decision category. Both are checked during validation.

## ⚖️ Conflict resolution

Chosen per ruleset:

| Strategy                | Behaviour                                                     |
| ----------------------- | ------------------------------------------------------------- |
| `PRIORITY_FIRST_MATCH`  | The rule with the highest priority wins                       |
| `PRIORITY_ALL_MATCHES`  | All of them apply; the highest priority has the last word     |
| `MOST_SPECIFIC`         | The rule with the most conditions wins                        |
| `BEST_FOR_CUSTOMER`     | The most advantageous one for the customer wins, by a per-category score |

The kill switch returns `defaultDecision` directly, with no evaluation. The same
result appears when no rule matches, signalled by `usedDefault: true`.

## ✅ Validation

`validateSnapshot()` runs before publishing and checks the shape of the data
(Zod), the existence and compatibility of operators with the value's type, that
the actions belong to the ruleset's category, parameter bounds, duplicate keys
and inverted validity windows.

Results are classified as `error` and `warning`. Warnings, such as two rules with
the same priority under `PRIORITY_FIRST_MATCH`, do not block publishing.

## 📦 Modules

| Module         | Role                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| `types.ts`     | Snapshot, rule, conditions, actions, result, trace                     |
| `operators.ts` | The operator catalog, typed on the fact's type                         |
| `evaluate.ts`  | Fact resolution and evaluation of the condition tree                   |
| `actions.ts`   | The action catalog per category and their application                  |
| `engine.ts`    | Orchestration: eligibility, matching, conflicts, decision              |
| `schemas.ts`   | Structural and semantic validation                                     |
| `canary.ts`    | Deterministic splitting into cohorts                                   |

```bash
pnpm --filter @ruleshop/rule-engine test
```
