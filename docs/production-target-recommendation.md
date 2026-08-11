# Recommendation: an optional monthly production target (not implemented)

Status: **proposal only** — documented before any schema change, per the Owner
Home redesign brief. Nothing in the app references this today.

## Context

The redesigned Owner Home shows production factually:

- today's production from the day's `deposit_logs` row;
- month-to-date production summed from this month's rows;
- an optional comparison against the previous month's recorded pace
  ("Last month had reached about $X by this point"), shown only when the prior
  month has at least 5 closed-out days.

There is deliberately **no** production goal on the surface. The org setting
`org_practice_settings.monthly_collections_target_cents` is a collections goal,
and a production target must never be derived from it — collections lag
production by insurance timing, so the two numbers answer different questions.

## The proposal

If owners want production paced the way collections already are, add one
nullable column:

```
org_practice_settings.monthly_production_target_cents  bigint  null
```

- Null (default) keeps today's behavior: factual production, no pace verdict.
- When set, `usePracticeVitals` can expose a paced production target exactly the
  way it paces collections, and `owner-pulse.ts` can render
  "ahead / on pace / behind" for production with the same ±2% on-pace band.
- Configured in Practice Settings next to the collections goal, subject to the
  same `collections_visibility` gating.

## Why not now

- No office has asked for it; the recorded prior-month comparison already
  answers "is production holding?" without inventing a number.
- Every added target increases scoreboard pressure on a surface that is meant
  to read like a briefing, not a quota board.

If this ships later, it must arrive as an org-configured setting — never a
hard-coded office value and never a derivation from the collections goal.
