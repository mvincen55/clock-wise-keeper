## Add "Archive" button to team member cards

**Where:** Inside each expanded employee card on `/team` (`src/components/TeamEmployeeCard.tsx`), add an "Archive" button in the card footer next to "Full Detail".

**Behavior:**
- Click → confirmation dialog ("Archive {name}? They'll be hidden from the team list but their history is preserved.")
- On confirm → update `employees.employment_status` from `'active'` to `'archived'`, set `archived_at = now()`.
- Invalidate the employees query so the card disappears from the list (existing `useEmployees` already filters to `active`).
- Toast on success.

**Notes:**
- Only visible to org admins/managers (check via existing role helper).
- No UI yet for unarchiving — out of scope unless you want it now.

Want me to also add a "View archived" toggle at the top of `/team` so you can unarchive later? Or keep this minimal and add that in a follow-up?