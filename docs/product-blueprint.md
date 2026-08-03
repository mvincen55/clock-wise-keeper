# Purple Envelope Product Blueprint

## 1. Product Vision

Purple Envelope is the operating system for an independent dental practice.

It helps the office manage employees, policies, time, communication, training, procedures, forms, goals, and everyday operational knowledge without becoming a patient-record system.

The governing product boundary is:

> Only your business, never your patients.

Purple Envelope may store blank form templates, office branding, approved wording, field definitions, packet structures, permissions, and de-identified configuration. It must not store completed patient forms, patient-entered values, signatures, treatment details, or patient-specific financial information.

## 2. Core Product Structure

The product has two primary worlds.

### Workplace

Workplace contains employee and office life:

- Timekeeping and timesheets
- PTO and attendance
- Employee requests and approvals
- Office calendar and closures
- Announcements and communication
- Policies and employee handbook
- Benefits and important office information
- Goals and temporary office challenges
- HR training
- Team roster

### Practice Playbook

Practice Playbook contains how the dental office performs excellent work:

- Standard operating procedures
- Clinical and administrative workflows
- Checklists
- Morning huddle tools
- Scripts and communication guidance
- Job training and mastery
- Financial Options Forms
- Forms Library
- Form Packets
- Fee schedule
- Reusable form sections
- Post-op and office instructions
- AI-assisted operational guidance

A feature has one primary home. It may appear elsewhere as an alert or shortcut, but it should not be duplicated as a separate product area.

## 3. Product Identity

The office's identity is dominant.

Inside an office account, the office logo and office name take visual priority. Purple Envelope remains visible through discreet product attribution, support, legal surfaces, emails, and the footer.

The intended brand hierarchy is:

1. The dental office
2. The office's approved visual system
3. Purple Envelope as the trusted platform powering it

Purple Envelope should feel quietly premium, calm, professional, warm, and highly organized. Stronger color and motion are reserved for unusual goals, competitions, urgent items, progress, and celebrations.

## 4. Navigation

### Desktop

Use a compact destination sidebar:

- Home
- Workplace
- Practice Playbook
- Inbox
- Management, when authorized

Settings, account controls, Help, privacy lock, support, and legal information belong in the user and utility areas rather than the main destination list.

### Mobile

Use a five-item bottom navigation:

- Home
- Workplace
- Playbook
- Inbox
- More

More contains role-appropriate management tools, settings, account controls, Help, privacy lock, and support.

### Inbox

Messages, Doctor Requests, Nudges, and Announcements should appear as coordinated Inbox workflows. They may retain separate tabs and behavior, but they should not feel like four unrelated communication products.

## 5. Home

Home is a clean, role-personalized launchpad, not a dump of every feature and task.

It should answer:

- What deserves my attention?
- What changed?
- Where should I go next?
- Is there anything unusual happening today?

The structure remains consistent across roles, but emphasis changes for employees, managers, and owners.

Home may include:

- A temporary office spotlight
- Important announcements
- Items requiring action
- Upcoming schedule or closure information
- Relevant shortcuts
- A restrained progress or goal summary

A temporary spotlight may represent a contest, prize, wager, special goal, deadline, initiative, or unusual office priority. It displays progress, deadline, reward, expected action, and completion state.

The existing dashboard currently stacks many unrelated cards and management concerns into one long page. The redesign should simplify and prioritize rather than preserve that density.

## 6. Global Time Control

Replace the oversized homepage clock with a compact global time control.

Desktop placement:

- Upper-right utility header
- Before notifications and profile
- Displays clocked-in status, running time, and one primary Clock In or Clock Out action
- Opens a popover for recent punches, correction, and full timesheet access

Mobile placement:

- Compact sticky clock bar above the bottom navigation

Only members who track time see it. Of the three membership types — Owner, Manager, Team — Owners are the only ones who never clock in; Managers and Team always do.

## 7. Management

Management is a central command center for owners and authorized managers.

It answers:

> What needs management attention?

It may surface:

- Pending approvals
- Attendance concerns
- PTO decisions
- Form and content changes awaiting approval
- Brand drafts
- Team issues
- Training concerns
- Operational risks
- Important office trends

Detailed administration remains inside the feature it belongs to. For example, detailed PTO configuration stays in Workplace, while detailed form administration stays in Practice Playbook.

Management must not become a duplicate copy of the entire application.

## 8. Progressive Onboarding

The office should become usable quickly, then complete setup through guided milestones.

### Initial setup

Collect only what is necessary to launch:

- Office name
- Logo
- Accent color
- Primary administrators
- Team invitations
- Office hours
- Basic time and PTO settings
- Initial product structure

### Progressive milestones

Guide the office through:

- Brand workshop
- Workplace policies
- Roles and permissions
- Practice Playbook structure
- Fee schedule
- Forms Library
- Packet mappings
- Content approvers
- Language reviewers
- Training and procedures
- Launch readiness

Purple Envelope should infer safe defaults from previous onboarding answers, uploaded policies, office structure, and existing configuration.

It should show the assumption and allow an authorized person to change it conversationally later.

Example:

> "Change the Patient Mode clear time to 15 minutes."

AI identifies the setting, explains the effect, checks permission, and requests confirmation before applying it.

Unsafe settings remain unavailable even when requested.

## 9. Office Brand System

Brand setup includes more than uploading a logo.

The office establishes an approved design system covering:

- Logo
- Office display and legal names
- Accent color
- Supporting palette
- Typography direction
- Heading hierarchy
- Spacing
- Field styling
- Header and footer treatments
- Rounded or squared visual direction
- Compact or spacious layouts
- Printed documents
- Forms and packets
- Sign-in
- Emails and notifications

The AI brand workshop proposes two or three coordinated directions based on the office's logo and optional examples.

Owners, managers, and designated brand administrators can modify the brand.

Brand changes remain drafts until previewed and published together. Preview includes desktop, mobile, sign-in, forms, packets, printouts, emails, headers, footers, and accessibility contrast.

Published brand versions retain history, notes, publisher, date, preview, and rollback.

Office Style forms use controlled variations rather than unrestricted free-form design.

Approved options may include:

- Compact or spacious
- One or two columns
- Alternate approved headers
- Emphasis blocks
- Form-specific content arrangements

## 10. AI Model

AI exists in two forms.

### Contextual AI

Located inside the current feature and aware of the permitted blank content or configuration being edited.

Examples:

- Improve a policy
- Reorganize a checklist
- Suggest form fields
- Reformat a form
- Explain a report
- Improve training material
- Compare versions

### Global office assistant

Answers broader operational questions and proposes cross-product changes.

Examples:

- "Where is our bereavement policy?"
- "Which training is overdue?"
- "Change the attendance timeout."
- "Show me forms affected by the revised medication section."
- "Help make our onboarding checklist easier."

AI respects the user's permissions and cannot apply protected changes without confirmation.

AI is completely disabled during live patient sessions.

## 11. Forms Library

Forms Library is a first-class Practice Playbook feature.

Managers and authorized editors can upload blank PDFs or scanned blank forms and convert them into digital templates.

Completed or patient-filled forms must never be uploaded for conversion.

### Form Studio

AI scans the blank form and proposes:

- Field locations
- Field types
- Labels
- Signature roles
- Repeating sections
- Layout improvements
- Office Style conversion

The manager, doctor, or authorized editor can talk to AI and request changes naturally.

Examples:

- "Make the medication section two columns."
- "Move the witness signature below the doctor signature."
- "Use checkboxes here."
- "Make this match our post-op form."
- "Preserve the original design."
- "Convert this into our Office Style."

Every AI change remains a draft and is manually editable.

### Supported fields

- Short text
- Long text
- Patient name
- Automatically inserted date
- Tooth number
- Procedure
- Currency and cost
- Checkboxes
- Yes or no
- Radio options
- Select-all-that-apply lists
- Medication lists
- Initials
- Staff or doctor name
- Signature
- Signer relationship
- Credentials
- Witness attestation

### Original versus Office Style

Each uploaded form can:

- Preserve its original appearance
- Be rebuilt using the office's visual system

Office Style is recommended for internally owned forms. External forms from insurers, manufacturers, attorneys, or other third parties may preserve their original layout.

## 12. Form Governance

Permissions use category defaults with per-form overrides.

The office controls:

- Who can edit
- Who can approve
- Who can publish
- Who can use
- Whether approval is required
- Who may approve substantive AI wording changes

The system must not assume every clinical form requires dentist approval.

A hygiene category might permit a hygienist or clinical lead to publish. A specific sedation form might require a dentist. An administrative form might be handled entirely by a manager.

Published forms cannot be permanently deleted. They may be archived. Unpublished drafts may be deleted.

Forms and packets stay pinned to approved versions. Updates are never silently substituted.

## 13. Reusable Sections

Authorized content administrators can maintain approved reusable sections such as:

- Consent language
- Risk and alternative language
- Medication lists
- Financial acknowledgments
- Signature blocks
- Witness language
- Standard office footer
- Post-treatment instructions

Forms remain pinned to the section version used when published.

When a section changes, an impact-review screen shows:

- Old and new wording
- AI summary
- Affected forms
- Affected packets
- Layout conflicts
- Signer conflicts
- Selective upgrade controls
- Preview before publishing

Nothing updates automatically.

## 14. Translations

AI may draft translations before use.

Approved language versions remain linked to the source form.

The office can publish:

- Translated-only format
- Bilingual format
- Both

Approval requirements are configurable by language and form category.

A review record may include:

- Reviewer
- Role
- Language
- Review method
- Optional qualification notes

When the source form changes, linked translations are flagged. The revised source version cannot be published until each translation is updated or explicitly confirmed as still accurate.

Patient Mode is blocked when a required form is unavailable in the selected approved language.

No live AI translation occurs during a patient session.

## 15. Form Packets

A packet groups several approved forms into one guided workflow while keeping every form on its own page.

Example:

**Extraction and Socket Preservation Packet**

- Extraction consent
- Socket preservation consent
- Financial Options Form
- Post-op instructions

Managers can configure:

- Forms included
- Page order
- Required and optional forms
- Conditional rules
- Signer assignments
- Language requirements
- Office and patient copies
- Electronic or paper signing
- Treatment mappings
- Financial form connections

Staff may also assemble one-time custom packets from approved forms. These are not saved automatically.

Owners, managers, and designated form or content administrators may convert a useful one-time packet into a reusable template. Other employees may submit packet suggestions.

## 16. Treatment-Based Form Suggestions

Purple Envelope provides editable starter mappings for common treatment and visit types.

Examples may include:

- Extraction
- Socket preservation
- SRP
- Crown
- Implant
- Emergency visit

The office must review and approve starter mappings before use.

Staff can either:

- Start from a treatment and receive approved suggestions
- Search and select approved forms manually
- Combine both approaches

Purple Envelope must never diagnose, select treatment, or claim which consent is legally required.

## 17. Financial Options Form Connections

The existing Financial Options Form remains structurally intact.

When creating it, staff are asked:

> Would you like to include the approved consent forms and instructions connected to this treatment plan?

Staff can review, add, remove, and reorder the connected documents.

The packet can be:

- Reviewed and signed electronically, then printed
- Printed with blank signature lines and signed with ink

The office controls document order, with the Financial Options Form first as the suggested default.

### Fees

For treatment plans with multiple procedures:

- Pull each office fee separately
- Calculate the total automatically
- Allow individual fee overrides
- Allow final-total overrides when appropriate
- Clearly identify custom amounts
- Show standard fee, entered amount, and difference

Any staff member preparing the financial form may enter an override.

Each office may choose whether:

- An override reason is required
- Discounts require approval
- Increases require approval
- Both require approval
- Neither requires approval
- Percentage thresholds apply
- Dollar thresholds apply

When a threshold is exceeded, an authorized person verifies through PIN, biometrics, or full reauthentication.

Consent forms only receive cost information when the blank template contains a mapped cost field.

A consent form receives the cost of the specific procedures covered by that consent. If it covers several procedures, list each procedure and cost plus a subtotal.

When a fee is overridden, connected forms use the same overridden amount shown to the patient.

All patient-specific financial information remains temporary.

## 18. Patient Mode

Patient Mode is a sealed, staff-led session.

Staff controls navigation and presents each form. The patient receives the device only for assigned reading, responses, initials, selections, or signatures.

The rest of Purple Envelope is hidden and locked behind staff authentication.

### Guided handoffs

Only the active participant's fields are enabled.

Supported participant roles include:

- Patient
- Parent or guardian
- Authorized representative
- Dentist
- Hygienist
- Assistant
- Witness
- Office staff
- Custom role

Each form is reviewed and signed page by page.

The same signature must never be copied across several forms.

### Employee identity

Employees verify their identity before signing using:

- Personal signing PIN
- Device biometrics when supported
- Full reauthentication

Managers may force a PIN reset but can never view or retrieve another employee's PIN.

Repeated failures trigger progressive protection and nonclinical security alerts.

### Session protection

The office may configure inactivity timing within enforced safety limits.

The session:

1. Locks after a short inactivity period
2. Warns before deletion
3. Permanently clears after a longer inactivity period

Never allow "never lock" or "never clear."

### Alternative signatures

The office may configure approved workflows for:

- Representative signatures
- Witnessed marks
- Documented inability to sign
- Verbal acknowledgment
- Approved accessibility procedures

Staff cannot invent a new signature method during Patient Mode.

## 19. Packet Integrity

Before signing begins, require a final packet check showing:

- Missing fields
- Signer assignments
- Forms ready to sign
- Blocked forms
- Language conflicts
- Optional forms selected
- Conditional forms
- Packet order

After the first signature:

- The form list locks
- Page order locks
- Forms cannot be added or removed
- Structural changes require restarting the session

When a shared value changes after signing, invalidate only the forms affected by that value.

Affected forms must be reviewed and signed again. Unaffected signatures remain intact.

Staff may correct answers, but changes to signed content trigger invalidation.

Only staff may navigate backward and reopen earlier pages.

## 20. Phase-One Patient Output

Phase one uses print only.

The completed form or packet is generated in temporary browser memory and sent to the office printer.

After printing, display:

> Did the completed form print correctly?

Actions:

- Print Again
- Yes, Clear Patient Information

After confirmation, destroy:

- Patient information
- Treatment selections
- Financial values
- Signer information
- Signature strokes
- Rendered pages
- PDF and canvas objects
- Temporary packet state

There is:

- No Download button
- No cloud copy
- No completed-form history
- No patient-session audit trail
- No autosave
- No analytics containing patient-session information

Purple Envelope keeps no record that the packet was completed, signed, or printed.

The printed document is the office's clinical record.

## 21. Release Plan

### Release 1: Product Foundation

This is the first build target.

Deliver:

- Office-first brand hierarchy
- Updated sign-in experience
- New destination navigation
- Role-personalized Home
- Workplace and Practice Playbook structure
- Unified Inbox
- Management command center
- Compact global time control
- Mobile bottom navigation
- Progressive onboarding framework
- Office branding controls
- Professional footer, Help, support, privacy, and legal surfaces
- Removal of duplicated application shells and confusing route presentation
- Migration of existing tools into their correct primary destinations

The existing repository already contains many of the underlying routes and tools, but presents them through a crowded navigation inventory and hardcoded Purple Envelope shell.

Do not rebuild functioning features without reason. Reorganize them behind a clearer information architecture.

### Release 2: Brand and Content Intelligence

Deliver:

- Guided AI brand workshop
- Brand drafts and publishing
- Brand version history and rollback
- Controlled form visual variations
- Contextual AI
- Global assistant
- Conversational settings changes
- Content approvers
- Reusable sections
- Impact review
- Translation workflow foundation

### Release 3: Forms and Packets

Deliver:

- Forms Library
- AI-assisted Form Studio
- Original and Office Style modes
- Field placement and signer-role assignment
- Template permissions and versions
- Archive behavior
- Form Packets
- Treatment mappings
- One-time packets
- Packet suggestions
- Financial Options Form connections
- Office and patient print-copy rules
- Paper-signing workflow

### Release 4: Local Electronic Signing

Deliver:

- Sealed Patient Mode
- Multi-signer handoffs
- Personal signing PIN
- Biometric and stronger authentication options
- Alternative signature workflows
- Shared temporary fields
- Packet-integrity rules
- Signed-form invalidation
- Inactivity locking and clearing
- Print and clear confirmation
- Automated patient-data leakage testing

Release 4 remains local and print-only. It does not store completed patient documents.

### Release 5: Optional Local Office Connector

Only after legal, security, and commercial review:

- Locally installed connector
- Approved network-folder filing
- Practice-specific storage destinations
- Reliable local-server communication
- No Purple Envelope cloud storage of completed forms

Do not build cloud patient-record storage as part of these releases.

## 22. Assumed Defaults

Unless an office changes them:

- Calm, polished visual system
- Office identity dominant
- Purple Envelope attribution discreet
- Role-aware Home
- Compact navigation
- Progressive onboarding
- Safe settings inferred and displayed
- Management command center plus contextual administration
- Contextual and global AI
- No AI during Patient Mode
- Forms use Office Style unless original preservation is selected
- Category permissions with per-form overrides
- Published forms archive rather than delete
- Version updates require review
- Patient Mode is staff-led
- Page-by-page review and signing
- Guided signer handoffs
- Print-only completed output
- No completed patient records stored
- No patient-session activity record
- Strong session clearing
- Manual office review of suggested treatment mappings

## 23. Nonnegotiable Technical Boundaries

Patient-entered values must never enter:

- Supabase
- Browser local storage
- Browser session storage
- URLs
- Query parameters
- Analytics
- Logs
- Error payloads
- AI prompts
- Support tools
- Audit records
- Autosave
- Network requests

Automated tests must verify those boundaries.

The existing Financial Options Form already documents a similar component-memory-only standard.

Blank templates, de-identified configuration, packet structure, approved language, branding, permissions, and field definitions may be saved.

## 24. Product Test

Every major product decision should pass these questions:

1. Does this make the dental office easier to operate?
2. Is the feature located where users naturally expect it?
3. Does it preserve the office's identity?
4. Does it respect role permissions?
5. Does it reduce clutter rather than add another destination?
6. Does it avoid storing patient information?
7. Can a normal dental-office employee understand it without software training?
8. Is the AI assisting rather than quietly taking authority?
9. Does the print experience look like it belongs to that office?
10. Can the office safely change the default later?
