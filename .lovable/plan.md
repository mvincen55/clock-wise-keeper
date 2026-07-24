No code changes. Acknowledging your review response:

- **#3 Break buttons** — Already fixed and merged (commit 1b4de89). Finding was analyzing pre-merge code; a fresh scan should clear it.
- **#1 Historical punches 4–5h off** — Not a live issue. One-time fake-UTC → real-UTC data fix already ran during remediation; no migration needed for fresh DBs.
- **#2 Evening clock-outs wrong day** — Could not reproduce; `getToday()` uses `easternDateKey()` and entries are attached by FK, not re-derived from `punch_time`.

No action to take. If a re-scan of 1b4de89 still flags #3, or you have a concrete repro for #2 (specific punch row + view), share it and I'll re-open.