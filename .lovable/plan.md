## The bug

You clocked out at 10:52 AM ET, but the punch shows 2:52 PM. That's a 4-hour offset — exactly the EDT→UTC gap.

Everywhere else in the app, punch times are stored as **Eastern time labeled as UTC** (naive ET). Display and the punch editor both assume that convention. But the Clock In / Clock Out / Break buttons call `new Date().toISOString()`, which produces real UTC. So 10:52 AM ET gets stored as `14:52Z` and rendered as "02:52 PM".

Same latent bug lives in the GPS auto-punch path and in "Clock out now" in the punch editor — any punch created from a live "now" is affected. Manually edited punches (like your 10:01 AM IN) are fine because the editor already uses the ET-as-UTC helper.

## Fix

1. Add one helper in `src/lib/time-utils.ts`:
   - `nowEasternIso()` — returns the current Eastern wall-clock time formatted as `YYYY-MM-DDTHH:MM:00.000Z` (seconds zeroed, matches existing convention).

2. Replace `new Date().toISOString()` (for punch_time values only) with `nowEasternIso()` in:
   - `src/hooks/useTimeEntries.ts` — `useClockAction` (the button you pressed)
   - `src/hooks/useGeoTracking.ts` — GPS auto-punch timestamp
   - `supabase/functions/process-location-event/index.ts` — server-side auto-punch fallback
   - `src/components/PunchEditorModal.tsx` — `addPunch()` and `setClockOutToNow()`

3. Redeploy the `process-location-event` edge function.

## Out of scope (not touching this round)

- `getToday()` and the various `new Date().toISOString().split('T')[0]` date pickers — same underlying issue but only misbehaves late at night, and fixing it risks shifting your existing data queries. Happy to do it in a follow-up.
- Audit fields like `edited_at`, `reviewed_at`, `approved_at` — those are true timestamps and correctly stored in UTC.
- Historical bad punches already in the database. The only known one so far is today's OUT punch; I can correct it after you approve.

## Acceptance

- Click Clock Out at 10:52 AM ET → punch row shows `10:52 AM`.
- GPS auto clock-in at 8:00 AM ET → shows `08:00 AM`.
- "Clock out now" in the editor produces a punch matching the wall clock.
