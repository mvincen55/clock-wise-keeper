# Team Onboarding — Feature List

Living spec for the team-member onboarding flow (invite accepted → fully set up member).
Add to this as decisions are made; nothing here is built yet unless noted.

## Confirmed features

### 1. Work-style & learning questions (feeds Pathfinder)
- During onboarding, the new member answers ~5 quick, friendly "get to know you" questions:
  how they like to learn new things, when in the day they do their best focused work,
  what kinds of tasks they tend to put off, how they like to receive feedback,
  what they want to get better at.
- Stored in `work_style_profiles` (table ships with the Goals feature).
- **Design rule (important):** never tell the member these answers shape their AI goal plans.
  Framing is culture / get-to-know-you so answers stay honest. If answers are visibly
  connected to plan-building, members will game them to minimize work. Pathfinder reads
  this profile quietly when breaking down goals, and the Goals UI never says
  "based on your answers…".

## Candidates to discuss (not yet decided)
- Profile completion: preferred name, role/position, start date.
- Policy manual acknowledgment (Policy Manual page already exists — natural onboarding step).
- First checklist assignment / training checklists.
- Set their first monthly goal as the onboarding finale (introduces Goals + Pathfinder).
- Notification preferences.

## Related groundwork already done
- Invite → accept flow (send-org-invite / accept-invite edge functions) is live — onboarding
  starts right after invite acceptance.
- Goals feature spec (Pathfinder breakdown, team/private goals, meeting updates) — see repo history.

## Related but separate
- Office/org onboarding spec (settings catalog from the 63-table schema) — deferred earlier,
  revisit alongside this.
