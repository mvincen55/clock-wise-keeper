# Invite link stuck on "Loading invite..." — diagnosis and smallest safe fix

## What I tested (read-only, nothing changed)

Latest pending invite (2026-08-04 13:13 UTC, recipient masked `te***`, org Harelick Dental, role employee, expires 2026-08-11, not yet accepted) used as the diagnostic target.

Unauthenticated lookup call to the deployed `accept-invite` function with that token:

- HTTP status: **200**
- Elapsed: sub-second (single round trip, no retry, no cold-start stall)
- Response shape: `{ invite: { email, role, invited_name, expires_at, accepted_at, org_id, orgs: { name } } }` — correct and complete
- No error in the function response; recent function logs show only normal boot/shutdown lines, no invocation errors

Live reproduction of `/accept-invite?token=…` in a signed-out browser: the page renders the "Join …" signup screen correctly within ~1.5s. Console shows only pre-existing React ref warnings and router future-flag warnings — no runtime error.

One important observation from the reproduction: **the lookup edge function was called twice** for a single page load.

## Root cause (most likely)

The backend is healthy. The hang is client-side, in `src/pages/AcceptInvite.tsx`.

The invite-loading effect depends on `[token, user, authLoading]`, so it re-runs whenever auth state settles, and it has no cancellation. Each run does an async lookup and then, on completion, decides the next step using the `authLoading` value **captured when that run started**.

Sequence that produces the permanent spinner:

```text
run #1 starts (authLoading = true)   -> async lookup in flight
auth resolves -> authLoading = false -> run #2 starts, second lookup in flight
run #2 finishes -> setStep('signup')  (correct screen briefly)
run #1 finishes LATE with stale authLoading=true -> setStep('loading')  <-- stuck
```

Nothing ever re-runs the effect after that, so the page sits on "Loading invite..." forever. Whether it sticks depends on which of the two in-flight lookups resolves last, which explains why it is intermittent and why my signed-out reproduction happened to land on the good ordering.

A second, independent path to the same permanently-true `authLoading` lives in `src/hooks/useAuth.tsx`: the allowlist check runs inside a `setTimeout` async callback with no `try/catch`. If `supabase.rpc('is_allowed_user')` rejects (network blip, transient 5xx — likely on a phone opening an email link), the callback throws, `setLoading(false)` is never reached, and `authLoading` stays `true` forever — again a permanent "Loading invite..." screen. Recipients on a session that is not yet allowlisted go through exactly this branch, which is why a *fresh* invite recipient is the one hitting it.

## Smallest safe fix

Two small, contained changes. No schema, no edge-function, no data changes.

1. `src/pages/AcceptInvite.tsx`
   - Add a `cancelled` guard (effect cleanup) so a stale run can never write state after a newer run.
   - Read the current auth state from a ref instead of the captured closure value when deciding the post-lookup step, or gate the effect to only run once `authLoading === false` (plus a `token`-keyed guard so the lookup fires once per token).
   - Result: exactly one lookup per token, and no late writer can push the page back to `loading`.

2. `src/hooks/useAuth.tsx`
   - Wrap the deferred allowlist check in `try/finally` so `setLoading(false)` always runs, even when the RPC rejects. Treat a failed check as "not allowed" rather than leaving auth in a permanent loading state.

## Tests

- Unit test on the invite-step reducer/effect: simulate a late-resolving lookup started while `authLoading` was true, after a newer lookup already set `signup`; assert the final step is `signup`, not `loading`.
- Unit test on `AuthProvider`: mock `is_allowed_user` to reject; assert `loading` becomes `false` and `isAllowed` is `false`.
- Component test: render `/accept-invite?token=…` with a mocked 200 lookup and assert exactly one lookup call and that the join form renders.

## Note for after the fix

Separate from the spinner: a recipient who signs up is signed in *before* `allowed_users` contains their email, so `AuthProvider` may sign them straight back out before `acceptInvite()` completes. Worth confirming as a follow-up once the spinner is fixed — it is a different failure (bounce back to the sign-in form, not a hang).
