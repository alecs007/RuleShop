# 🛒 @ruleshop/storefront

The storefront decisions, as a pure service on top of
[`@ruleshop/rule-engine`](../rule-engine/README.md). Every decision point
receives the published rule snapshot and the relevant facts and returns what
should be displayed, together with the explanation. No function touches the
database or performs I/O: the application fetches the data, the package decides.

It follows that the same function serves the storefront, the control plane tester
that shows the effect of a rule before publishing, and the simulation of a
candidate version over historical events — without three implementations that
could disagree with one another.

```ts
import { computeAvailability, computePrice } from "@ruleshop/storefront";

const view = computeAvailability({
  product: facts,
  snapshot: availabilitySnapshot,
  actor: { customer: { loyaltyTier: "VIP" }, session: { isGuest: false } },
});

view.available;     // false
view.reason;        // "out-of-stock"
view.matchedRules;  // ["hide-out-of-stock"]
```

## 📦 Modules

| Module               | Decision                                                        |
| -------------------- | --------------------------------------------------------------- |
| `pricing.ts`         | The final price from the PRICING decision (percent, fixed amount, caps) |
| `availability.ts`    | Availability, hiding, quantity cap                               |
| `shipping.ts`        | Shipping cost and options, on top of the store's methods         |
| `fraud.ts`           | Risk score, level and the fraud decision                         |
| `loyalty.ts`         | Points, multipliers, tier thresholds                             |
| `theme.ts`           | CSS tokens, banner, layout variant                               |
| `order-status.ts`    | The labels and descriptions of the order statuses                |
| `catalog-params.ts`  | Parsing the catalog parameters (search, filters, sorting)        |
| `shipping-methods.ts`| The schema of the shipping methods from the store settings       |
| `types.ts`           | `ActorFacts`, `OrderStatus`                                      |

`OrderStatus` mirrors the enum from the Prisma schema, but is declared locally so
the package does not depend on the generated client. If the enum changes,
`ORDER_STATUS_LABELS` stops compiling.

## 🧪 Tests

```bash
pnpm --filter @ruleshop/storefront test
```

107 tests across the six decision points: thresholds, caps, kill switch,
rules that do not match, and falling back to the default decision.
