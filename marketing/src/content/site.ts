/* ============================================================================
   PURPLE ENVELOPE — ALL MARKETING COPY AND PRICING LIVES IN THIS FILE.
   Change wording and numbers here. You should never need to open a component.

   Every item marked TODO(megan) is listed at the bottom in PUBLISH_BLOCKERS
   and shows up as a banner when you run `npm run dev`. It does not show in
   the production build.
   ========================================================================== */

/* ── Links and endpoints ──────────────────────────────────────────────────
   Both are empty on purpose. An empty value renders a visible "needs a link"
   block instead of a button that silently goes nowhere. */
export const links = {
  /** TODO(megan): paste your Cal.com / Calendly / SavvyCal booking link. */
  bookingUrl: "",
  /** TODO(megan): email-capture endpoint (Formspark, Buttondown, CF Worker).
   *  Must accept a POST with { email }. */
  betaEndpoint: "",
  /** Used as the fallback if betaEndpoint is empty, and in the footer. */
  contactEmail: "megan@purpleenvelope.app",
  siteUrl: "https://purpleenvelope.app",
  /** Where the actual product lives. */
  appUrl: "https://purpleenvelope.app",
};

/* ── Pricing ──────────────────────────────────────────────────────────────
   TODO(megan): none of these numbers are confirmed. Working band from the
   brief: ~$99 introductory, ~$140 target, $180–190 top. Per office, per
   month. Confirm before publish. */
export const pricing = {
  unit: "per office, per month",
  tiers: [
    {
      name: "Introductory",
      price: 99,
      who: "Early offices, while I still provision accounts by hand.",
      includes: [
        "Every feature. No modules held back.",
        "Everyone at the office. No per-person charge.",
        "Setup done with you, not handed to you.",
      ],
    },
    {
      name: "Standard",
      price: 140,
      who: "One office, running everything.",
      includes: [
        "Every feature. No modules held back.",
        "Everyone at the office. No per-person charge.",
        "Your rules, your forms, your closeout order.",
      ],
      emphasis: true,
    },
    {
      name: "Full",
      price: 190,
      who: "Offices that want the estimator, the goals, and the training built out with them.",
      includes: [
        "Everything in Standard.",
        "Financial options form configured to your own fee schedule.",
        "Training modules written for your office's own problems.",
      ],
    },
  ],

  /* The numbers that are not fun to publish. These sit next to the price on
     purpose — a price with the costs hidden underneath it is worse than no
     price at all. */
  unpleasant: {
    label: "The parts that are not fun to put on a website",
    items: [
      {
        /* TODO(megan): replace "a couple of sessions" with the real hours.
           Kept out of the visible copy on purpose — see PUBLISH_BLOCKERS #9. */
        k: "Setup is not fifteen minutes",
        v: "Onboarding is you showing it how your office runs, then correcting it when it gets them wrong. Expect a couple of sessions and some homework in between.",
      },
      {
        k: "There is no signup button",
        v: "I make every account by hand. There is no billing system yet, so the first invoice comes from me, not from Stripe.",
      },
      {
        k: "One office per subscription",
        v: "Multiple locations under one login is not built. If you have two offices, that's two subscriptions and they don't talk to each other yet.",
      },
      {
        k: "Export is partly built",
        v: "Timesheets and attendance come out as Excel or CSV today, and everything prints. One-button export of your forms and policies is not done. Details on the data page — I'd rather you read it before you pay me.",
      },
      {
        k: "It is one person",
        v: "Me. If I'm at my day job with a patient in the chair, I answer in the evening.",
      },
    ],
  },
};

/* ── The CTA. Same on both pages. ─────────────────────────────────────────── */
export const cta = {
  primary: {
    label: "Book a 20-minute call",
    /* Honest about what actually happens on it. */
    what: [
      "I show you the thing. Screen share, real office, real data blurred.",
      "You already know the price. It's up the page.",
      "Nobody calls you afterward. Not me, not a rep, not a sequence.",
    ],
  },
  secondary: {
    label: "Join the beta list",
    note: "Early access. One email when there's a spot, and nothing else.",
    placeholder: "you@youroffice.com",
    success: "You're on the list. You'll hear from me once.",
    /* Error states give direction and do not apologize. */
    errorInvalid: "That address is missing something. Check it and send again.",
    errorSend: "That didn't go through. Email me directly and I'll add you.",
  },
  policy: "No sales calls. Ever. No cold calls, no drip sequence, no “just checking in.”",
};

/* ── Doctor / owner page (/) ──────────────────────────────────────────────── */
export const doctor = {
  eyebrow: "For independent dental offices",

  hero: {
    h1: "What corporate offices use to run twelve locations. Priced for one.",
    /* The patient-comms mis-sort gets killed in the second sentence, above
       the fold, before anything else is claimed. */
    sub: "This is the office side. The closeout nobody finished, the deposit log at 5:47 on a Friday, the estimate that got explained wrong, the thing you asked for three times.",
    kill: "It never contacts a patient and it stores no patient data. Not the chart. Never the chart.",
    demoNote: "Tick something. It's the real thing, not a picture of it.",
  },

  notThis: {
    label: "Before you sort this into the wrong bin",
    intro:
      "Most people hear “software for dental offices” and file it under patient texting. That's not this, and if that's what you need I'll point you somewhere else.",
    items: [
      {
        k: "Not patient communication",
        v: "Not Weave. Not Modento. No texting, no recall, no reminders. Your patients never hear from it.",
      },
      {
        k: "Not payroll, not HR",
        v: "Go to Paychex for that. This hands your payroll person clean hours; it doesn't cut the check.",
      },
      {
        k: "Not a time clock app",
        v: "It does punch people in. But if a clock is genuinely all you need, Homebase is cheaper and I'd rather tell you that now.",
      },
      {
        k: "Not clinical, not accounting",
        v: "It stores no patient data at all. Your chart software stays your chart software.",
      },
    ],
  },

  pains: {
    label: "The five you already recognize",
    intro:
      "I'm not going to describe your office to you in general terms. Here are the specific ones. If none of these land, this isn't for you and that's fine.",
    items: [
      {
        id: "late",
        title: "The assistant who's late again",
        body: "Third time this month. You know exactly what you'd have to say. You also know you're not going to say it today, and neither is your manager.",
      },
      {
        id: "deposit",
        title: "The deposit log at the end of the day",
        body: "Two bank accounts. Office copy, bank copy. Both have to balance, somebody has to sign it, and it's the end of a long day.",
      },
      {
        id: "checklist",
        title: "The checklist nobody finished",
        body: "It got marked done. It wasn't done. You find out on Monday, from a patient.",
      },
      {
        id: "estimate",
        title: "The estimate explained in a way you'd never have phrased it",
        body: "You would not have said it like that. The patient heard it that way anyway, and now you're having a different conversation than the one you planned.",
      },
      {
        id: "thrice",
        title: "The thing you asked for three times",
        body: "You asked in March. You asked again in April. You mentioned it last week. It is still not done and now asking a fourth time is its own problem.",
      },
    ],
  },

  mechanism: {
    label: "What it actually does about it",
    h2: "It communicates the expectation so you don't have to remember to.",
    body: "Every one of those is the same failure: the expectation lived in your head, and getting it out of your head costs you a conversation you don't want to have. So the system says it instead. On time, in writing, as a fact.",
    rules: [
      {
        k: "Thresholds are visible before they're crossed",
        v: "Nobody finds out the rule existed at the moment it's used on them. It's on the wall, in the app, from day one.",
      },
      {
        k: "Timelines are stated",
        v: "“By Thursday” is in the notice. Not “soon,” not “as discussed.”",
      },
      {
        k: "Notices are factual, never threats",
        v: "It records what happened and what the rule says. It doesn't editorialize, and it doesn't do tone.",
      },
    ],
    /* The real, shipped upward mechanism. Enforced in the database, not in
       the interface — see supabase/migrations/20260728190000_incident_signatures.sql.
       Deliberately concrete, because the general version is still roadmap. */
    upward: {
      k: "And it points up, not just down",
      v: "You'll assume this is a tool for holding the team accountable. Here is the part that isn't: when an incident report is about a manager, a manager cannot be the one who signs it off. It requires an owner. Nobody — including me, including you — can close out a report written about themselves. That rule lives in the database, not in a settings screen, so it can't be switched off by whoever happens to be annoyed that day.",
      why: "Any accountability tool points down at the staff. Pointing it at management is how you find out whether it's honest.",
    },
  },

  /* “The AI is that office.” All four mechanics below are shipped — see
     docs/kimi-assistant.md in the app repo. */
  ai: {
    label: "The part that makes it yours",
    h2: "The AI is that office. Not a model that learned dentistry in general.",
    body: "It isn't trained on a pooled dataset scraped across a thousand practices, which would only ever give you the average of everyone else's habits. It's taught by your office, and what it learns stays yours. Onboarding is showing it how you do things, then correcting it when it gets them wrong.",
    items: [
      {
        k: "It learns your words, not the industry's",
        v: "If your office says a lab piece is a “delivery” and never a “seating,” you tell it once and it never says seating again. That becomes a standing rule, not a preference it drifts away from.",
      },
      {
        k: "It won't quietly overwrite what it knew",
        v: "When something you tell it contradicts something it already had, it stops and asks instead of picking. The contradiction sits in a “needs your decision” list and is used in exactly zero answers until a human resolves it.",
      },
      {
        k: "It files knowledge where it belongs",
        v: "Something true for every patient goes on your office's own schedule. Something that's only true when you're billing one particular carrier goes on that carrier's. Getting that wrong is how estimates end up wrong.",
      },
      {
        k: "It checks its own filing",
        v: "A second pass reads back everything the office has taught it, looking for contradictions and things filed in the wrong place. It proposes; it doesn't silently fix.",
      },
    ],
    boundary:
      "No patient's name or details ever reach the AI. That isn't a setting — the code builds its input from procedure codes, and the patient data on a financial options form is never written to a database at all.",
  },

  asymmetry: {
    label: "Why this didn't exist for you already",
    h2: "The tools were never out of reach. Independents were priced out on purpose.",
    intro:
      "Three things a group of forty offices gets that one office does not. You know all three from your own numbers.",
    items: [
      {
        n: "01",
        k: "Staff health insurance",
        v: "Forty offices buy as one risk pool. One office gets quoted as one office. That gap is why your good assistant takes the corporate offer.",
      },
      {
        n: "02",
        k: "Fee-schedule leverage",
        v: "A group negotiates with volume behind it. You get the rate you get, and you find out what it is when it arrives.",
      },
      {
        n: "03",
        k: "Integration pricing",
        v: "Enterprise API access is priced per seat against hundreds of seats. At your size the same integration costs more per chair than the software it connects to.",
      },
    ],
    /* Explicit guard. A real share of this audience has an offer in a drawer
       or friends who took one. The structure is the target; never colleagues. */
    guard: {
      k: "This is not a shot at anyone who sold",
      v: "The offer is good because the math is real. Half the people I respect in this business took it or are thinking about it, and I'm not going to pretend that's a character flaw. The math is what I'm arguing with, not the people who did it correctly.",
    },
  },

  founder: {
    label: "Who built this",
    h2: "Megan Vincent",
    body: [
      "I've run the front office of an independent dental practice for ten years. I was hired with no clinical background. I did not know what a composite was. I did not know what an endo was. I learned from Google and YouTube, and the office was up 60%.",
      "Before dental I spent about five years in a large hospital chain across the Carolinas. Good benefits. I was a cog in a wheel and there was no path up that anyone could show me.",
      "I built this to get my own work off my own desk. It runs my office every day — it's my job's infrastructure, not a side project I'm hoping takes off.",
      "I'm also the person your vendors call. I know which thirty minutes of that you don't want to sit through, which is most of why this site works the way it does.",
    ],
    /* One person built this. That is evidence for the argument, not an apology. */
    solo: "One person with ten years of domain knowledge built the thing the enterprise platforms quote you five figures for. That's not a disclaimer. That's the whole point — the asymmetry is breakable, and this is what breaking it looks like.",

    /* True origin. The string 'Purple envelope — no tape' is still in the
       app's print-invariant test fixture. Not a branding exercise. */
    name: {
      k: "Where the name came from",
      v: "The deposit log printed a note at the bottom for whoever ran the deposit to the bank: purple envelope — no tape. It was on every copy for years. When this needed a name I didn't hire anyone to think of one.",
    },
    /* Stays an empty frame until a real photo exists. No stock headshot, ever —
       an empty frame is more honest than a model in scrubs. */
    portraitLabel: "Her actual face goes here",
    portraitTodo: "TODO(megan): send a real photo. The one from the office is fine.",
  },

  omCrossLink: "Your office manager's version",
};

/* ── Office manager page (/office-manager) ────────────────────────────────── */
export const officeManager = {
  eyebrow: "For the person actually running it",

  hero: {
    h1: "The whole system is in your head. That's the problem.",
    sub: "You know the closeout order. You know which one needs reminding twice. You know what he actually wants even when he didn't say it. None of that survives you taking a week off.",
    kill: "This puts it somewhere else. Still yours, still the way you run it — just no longer only in your head. It stores no patient data and it never contacts a patient.",
    /* Must not promise the unbuilt reason-routing. Describes only what the
       sheet actually does. */
    demoNote: "This is the real closing list. Every box records who ticked it, and un-ticking someone else's takes a manager — which is you.",
  },

  pains: {
    label: "Four things I'm not going to explain to you",
    intro: "I've had your job for ten years. I still have it.",
    items: [
      {
        id: "out",
        title: "It doesn't survive you being out",
        body: "You take four days. You come back to a week of cleanup and a drawer nobody counted. Taking time off costs you more than working does, so you don't.",
      },
      {
        id: "conversation",
        title: "You're the one who has to say it",
        body: "The uncomfortable conversation is somehow always your job. This one makes the first move: the expectation goes out on time, in writing, as a fact, before it's a confrontation.",
      },
      {
        id: "upward",
        title: "You need follow-through from him too",
        body: "You asked. He agreed. It's three weeks later. You can't nag the owner, so it quietly becomes your problem instead — and then your fault.",
      },
      {
        id: "didthat",
        title: "“Did that get done?”",
        body: "Asked at 4:50, about something from Tuesday. You'd like to be able to point at a screen instead of reconstructing it from memory.",
      },
    ],
  },

  upward: {
    label: "The part you'll care about most",
    h2: "It escalates upward.",
    body: "Almost everything sold to a dental office points down at the team. This points both directions. When the owner sets a rule, the rule applies to the owner's own follow-through too — if something needs his sign-off and it's been sitting five days, that shows up on his screen with a date on it, from the system, not from you in a hallway for the fourth time.",
    note: "You stop being the mechanism. That's the difference.",
  },

  /* Never “you're replaceable.” The frame is that it stops depending on one
     person being present — which is what protects her, not what threatens her. */
  notReplacing: {
    k: "To be extremely clear about one thing",
    v: "This does not replace you. It cannot. Every rule in it is a decision somebody with your job has to make — what the closeout order is, what counts as late, how the estimate gets worded, which corner is never cut. It's you, written down and enforced consistently while you're at lunch. The office needs you more legibly, not less.",
  },

  internalCase: {
    label: "Making the case to him",
    h2: "What to say when he asks what it costs and why now",
    points: [
      {
        k: "Lead with the price, because it's on the site",
        v: "He expects “I'll get you a quote.” You hand him a number. That alone separates this from the last four vendors that came through.",
      },
      {
        k: "It's not a patient-facing spend",
        v: "This is the objection you'll get first. It doesn't touch the schedule, doesn't text patients, doesn't go near the chart. Nothing about the patient experience changes, so nothing has to be re-trained on the clinical side.",
      },
      {
        k: "Tell him it points at you too",
        v: "Don't hide it — it's the strongest thing you can say. You're volunteering to be held to the rules he sets. That's a hard offer to argue with, and it's why he'll believe the rest of it.",
      },
      {
        k: "There's no contract to get out of",
        v: "Month to month. If it's not doing anything by month two, you stop. He's approved worse on less.",
      },
    ],
  },

  sendToDoctor: {
    label: "Send it to him",
    h2: "His version is a different page.",
    body: "Written for an owner: the money, the asymmetry, the price. You don't have to explain any of it — send the link and let him read it cold.",
    button: "Copy the link for your doctor",
    copied: "Copied. Paste it in an email.",
    emailButton: "Copy a short email too",
    emailCopied: "Email copied.",
    /* Paste-ready, in an OM's voice, no marketing language. Deliberately
       short — a long forward doesn't get read. */
    emailSubject: "Something for the office side",
    emailBody: `Hi Dr. —

Found this and I think it's worth twenty minutes: {{URL}}

It's office operations, not patient communication. Closeouts, the deposit log, the estimator, and it handles the follow-through on things I currently have to chase people for. It doesn't touch the schedule or the chart.

The price is on the page, which is why I'm sending it instead of setting up a call. Month to month, one price for the whole office.

One thing I want to flag on purpose: it holds me to the rules you set too, not just the team. I'm fine with that.

If you want, I'll book the 20-minute walkthrough and sit in.`,
  },

  doctorCrossLink: "The owner's version",
};

/* ── Data / guarantee page (/your-data) ───────────────────────────────────── */
export const yourData = {
  eyebrow: "Three things you can check without talking to me",
  h1: "What you can verify before you trust me with your office.",
  intro:
    "I'm one person asking you to run your office on software I wrote. You should not take that on faith, and “trust me” is not an argument. So here are three things you can check yourself, right now, in about a minute. The third one is partly bad news and I'm putting it on the page anyway.",

  legs: [
    {
      n: "01",
      h: "The price is on the site",
      body: [
        "You saw it before you gave me anything. No form, no email wall, no thirty minutes of Zoom before a number.",
        "The costs that aren't fun are on the same page as the price, directly underneath it. Setup time, the fact that I invoice by hand, the fact that multi-location isn't built. A price with the bad parts hidden under it is worse than no price.",
      ],
      check: "Go look. It's on both pages, above the fold on neither — but you never have to ask for it.",
    },
    {
      n: "02",
      h: "No sales calls. Ever.",
      body: [
        "No cold calls. No drip sequence. No “just checking in.” No rep assigned to your account, because there are no reps.",
        "If you book a call and then go quiet, that is the end of it. You will not hear from me again unless you write first. If you join the beta list you get one email when a spot opens and nothing else.",
        "Every vendor says they're not like the other vendors. The difference is that this one is checkable: give me an address, wait, and count the emails.",
      ],
      check: "The test is that nothing happens. Give me a contact detail and see.",
    },
    {
      n: "03",
      h: "Your data and configuration leave whenever you want",
      /* HONEST STATUS. Verified against the codebase 2026-07-30: full
         self-serve export is NOT built. See PUBLISH_BLOCKERS #2. */
      status: "partly built — read this one properly",
      body: [
        "This is the leg I can't yet claim in full, so here is exactly where it stands.",
      ],
      built: {
        label: "What you can do today",
        items: [
          "Timesheets download as Excel, with punch in and out times.",
          "Attendance, exceptions and days-off download as CSV.",
          "The fee schedule downloads as Excel.",
          "Every form and report prints — deposit log, financial option form, incident report, PTO. Print to PDF from the dialog if you want a file.",
        ],
      },
      notBuilt: {
        label: "What is not built yet",
        items: [
          "One button that exports the whole office at once.",
          "Your forms out as generated PDFs, rather than printed from the browser.",
          "Your policies and rules out as documents. Right now an uploaded policy can be read in the app but not downloaded back out. That's a real gap and it's mine.",
          "PTO accrual history — balances and the running ledger, not just the list of days off.",
        ],
      },
      promise: {
        label: "What I'll commit to regardless",
        items: [
          "90 days notice before any shutdown, with the service staying up for all 90.",
          "No exit fee and no death clause. You don't have to be leaving to get your data.",
          "If the company ever shuts down, the code is released.",
        ],
      },
      check: "When the missing pieces ship, this page changes and I'll say so. If it still says this in six months, that tells you something too.",
    },
  ],

  /* Aimed outward: what it buys the customer, not what it says about her. */
  antiDso: {
    label: "The other question you're going to ask",
    h2: "This doesn't get bought out from under you.",
    body: [
      "You've watched a tool you liked get acquired and turn into something else. That's the real risk with a small vendor, and it's a fair thing to ask about.",
      "There are no investors. Nobody holds a stake that has to be returned, so there's no board that can decide a sale is due and no clock running on somebody else's money. The structure is what protects you here, not my promises about myself.",
      "Concretely: the software you run your office on does not become a DSO's onboarding funnel two years from now. It isn't for sale to one.",
    ],
  },

  why: {
    label: "Why any of this is credible",
    items: [
      {
        k: "It runs my office every day",
        v: "I'm a full-time dental office manager. This is the infrastructure of the job I still have. If it breaks, it breaks on me first, at 7am, before it ever reaches you.",
      },
      {
        k: "No investors",
        v: "Nothing forces a pivot, a price hike on a funding schedule, or an acquisition.",
      },
      {
        k: "Built to run cheap",
        v: "It doesn't need to scale to survive. A product that needs a thousand offices to break even eventually does something you won't like. This one doesn't.",
      },
      {
        k: "No patient data at all",
        v: "Not minimized, not encrypted-at-rest-and-hopefully-fine. It isn't there. There's no patient record in the system to leak, which is also why nothing here needs a HIPAA conversation.",
      },
    ],
  },
};

/* ── The sandbox ──────────────────────────────────────────────────────────────
   Every panel is modelled on the real product. Where the brief asked for
   behavior the app doesn't have yet, the panel says so rather than acting it
   out — a demo that fakes a mechanism is a worse lie than a fake testimonial,
   because it's the thing a buyer actually evaluates.

   Status values: "ships" = in the product today. "building" = designed, not
   built. Nothing is left ambiguous. */
export const demo = {
  label: "Try the actual thing",
  h2: "No signup, no email, no sales engineer driving.",
  intro:
    "This is the real interface with fake names in it. Nothing you do here touches anything, and nothing here came out of a live office. Reset it whenever.",
  reset: "Reset the sandbox",
  /* Easter egg: the personality budget goes in the demo, never near pricing
     or the data page. Fires only after repeated resets. */
  resetAgain: ["Reset the sandbox", "Reset it again", "Fine. Again.", "You and I are very similar."],

  statusLabels: {
    ships: "In the product today",
    building: "Designed, not built yet",
  },

  panels: {
    closeout: {
      tab: "Closing duties",
      title: "Clinical — Assistant · Daily",
      status: "ships",
      note: "Real items from the seeded assistant list. Boxes record who ticked them, by name.",
      /* Verbatim from src/lib/checklist-defaults.ts in the app. */
      items: [
        "Fill ultrasonic and sterilizers",
        "Run water through handpiece lines",
        "Wipe composite off instruments",
        "Clean sterilization area, lab, and impression trays",
        "Run suction line cleaner",
        "Log out of practice management software",
        "Take out trash",
        "Confirm suction & compressor are off (if last one out)",
      ],
      done: "Closed out. Every box has a name and a time against it.",
      lockedNote: "Only managers can un-check somebody else's box.",
      unfinished: {
        k: "Leave one unticked and nothing chases it",
        v: "Right now an unticked box is just an absent row — the manager's own weekly list says “check assistant checklist” and a human goes and looks. A required reason that routes itself to the manager is designed and not built. I'd rather you know which half you're buying.",
        status: "building",
      },
    },

    deposit: {
      tab: "Deposit log",
      title: "Daily Deposit Log",
      status: "ships",
      note: "Amounts only, one record per day. Fill it in and print both copies.",
      fields: {
        cash: "Cash",
        checks: "Checks",
        insCards: "Insurance credit cards",
        patCards: "Patient credit cards",
        financing: "Outside financing",
      },
      addCheck: "Add check",
      totals: {
        bank: "Bank deposit (cash + checks)",
        cards: "Card deposits",
        total: "Total",
      },
      /* Real split, real default labels from useOrgBranding.ts. */
      split: {
        label: "Bank split",
        a: "Bank — cash & checks",
        b: "Bank — card deposits",
      },
      print: "Print both copies",
      officeCopy: "Office copy",
      bankCopy: "Bank copy",
      officeFooter: "Daily Deposit Log · Office copy — file with the day sheet",
      bankFooter: "Purple envelope — no tape",
      preparedBy: "Prepared by",
      initials: "Initials",
      noBalance: {
        k: "It does not reconcile against your day sheet",
        v: "It adds up what you enter and splits it across the two accounts. It does not compare that to what the practice software says it should be. If you want an over-and-short line, that's not built.",
        status: "building",
      },
    },

    upward: {
      tab: "Escalation, upward",
      title: "Incident report · sign-off",
      status: "ships",
      note: "Who has to sign depends on who the report is about — not on who wrote it.",
      subjectLabel: "This report is about",
      people: [
        { name: "Dana Whitfield", role: "employee", signer: "manager" },
        { name: "Ruth Calloway", role: "manager", signer: "owner" },
      ],
      roleLabels: { employee: "Assistant", manager: "Office manager", owner: "Owner" },
      signAs: "Try signing as",
      needs: "Needs sign-off from",
      ok: "Signed off.",
      /* Verbatim from the database function's exception messages. */
      blockedManager: "This report is about a manager or an owner — an owner has to sign it off.",
      blockedSelf: "An incident report cannot be signed off by the person it is about.",
      point:
        "Both refusals come from the database, not from a permission checkbox somebody can quietly turn off.",
      lateness: {
        k: "What lateness does today",
        v: "Late is measured per person, per weekday, against a grace window and a minutes-late threshold you set. Out of the box the threshold is one minute. The employee gets asked for a reason; the manager approves or unapproves it with a reason of their own, and it lands on the tardy report.",
        status: "ships",
      },
      chain: {
        k: "What a third late doesn't do yet",
        v: "Count the occurrences, open a task on the manager's list, write an HR record the employee can see, and start a clock before it reaches the owner. That whole chain is designed and unbuilt. Today, three lates is three rows on a report somebody has to read.",
        status: "building",
      },
    },

    estimate: {
      tab: "Patient estimate",
      title: "Financial Options Form",
      status: "ships",
      note: "Priced off your fee schedule and the carrier's, then printed for the patient to sign.",
      addProcedure: "Add procedure",
      cols: { code: "Code", desc: "Description", tooth: "Tooth", fee: "Office fee", allowed: "Allowed" },
      insurance: "Insurance estimate",
      prepay: "Prepay in full",
      installments: "Payment installments",
      youSave: "You save",
      yourPortion: "Your total cost (your portion)",
      printPatient: "Patient copy",
      printOffice: "Office copy — FOF detail",
      wording: {
        k: "The wording is yours",
        v: "The description that prints writes itself off the procedure codes, in your office's language — and the office teaches it that language. This is the one that stops an estimate being explained in a way you'd never have phrased it.",
        status: "ships",
      },
      noPatientData: "Nothing typed on this form is ever saved to a database. Not here, and not in the real product.",
    },
  },
};

/* ── Video slots. Empty frames until real files exist. ────────────────────── */
export const videos = {
  label: "45 seconds each",
  intro:
    "One per problem, short enough to actually watch between patients. These double as the ads, which is most of the production cost gone.",
  /* TODO(megan): drop files in /public/video/ and set src. Slots stay empty
     frames until then — no invented content, no placeholder stock footage. */
  slots: [
    { id: "late", title: "Third time late", length: "0:45", src: "" },
    { id: "deposit", title: "Deposit log, two accounts", length: "0:45", src: "" },
    { id: "checklist", title: "The closeout nobody finished", length: "0:45", src: "" },
    { id: "estimate", title: "The estimate, worded your way", length: "0:45", src: "" },
    { id: "thrice", title: "Asked three times", length: "0:45", src: "" },
  ],
  long: {
    id: "walkthrough",
    title: "The whole thing, start to finish",
    length: "TODO(megan)",
    note: "For people who've already decided and want to see all of it.",
    src: "",
  },
};

/* ── Footer ───────────────────────────────────────────────────────────────── */
export const footer = {
  line: "Purple Envelope — office operations for independent dental practices.",
  noPhi: "Stores no patient data. Never contacts a patient.",
  /* TODO(megan): terms and privacy pages don't exist yet. ROADMAP.md line 12
     has the ToS as unchecked. Links stay off until they're real. */
};

/* ── Publish blockers ─────────────────────────────────────────────────────────
   Shown as a banner in `npm run dev` only. Answer these and the site is
   publishable. Numbered so they can be answered in one sitting. */
export const PUBLISH_BLOCKERS = [
  {
    n: 1,
    severity: "blocker",
    title: "Confirm the pricing",
    detail:
      "$99 / $140 / $190 are the brief's working band, not your decision. Three tiers was my call — say the word and it becomes one flat price. Edit `pricing.tiers` in src/content/site.ts.",
  },
  {
    n: 2,
    severity: "blocker",
    title: "Self-serve export does not exist — the data page says so",
    detail:
      "Verified in the app code: no PDF generation anywhere, uploaded policies can't be downloaded back out, and the multi-table backup in WipeDataTool.tsx is never imported so nobody can reach it. Only timesheet XLSX and attendance CSV ship. The /your-data page now lists exactly what works and what doesn't instead of making the full claim. Either ship export and let me rewrite that section, or approve it as written.",
  },
  {
    n: 3,
    severity: "blocker",
    title: "I did not build the escalation demo the brief asked for, because it isn't real",
    detail:
      "The brief wanted: mark someone late a third time, watch a manager task appear, an HR entry get created, and a timer start before the owner is notified. None of that exists — there's no occurrence counter, no HR record, no task generation, and no lateness notification at all (ROADMAP.md:18 has the whole chain as unbuilt, blocked on the one-off task type). Acting it out would have faked the exact mechanism a buyer evaluates. So the escalation panel demos the upward rule that IS shipped and DB-enforced (a report about a manager needs an owner's signature; nobody signs their own), shows what lateness really does today, and names the missing chain as unbuilt. Overrule me if you want the aspirational version, but it should be labelled a mockup if so.",
  },
  {
    n: 4,
    severity: "blocker",
    title: "Booking link",
    detail:
      "links.bookingUrl is empty, so the primary CTA renders as a visible placeholder rather than a dead button. Paste your Cal.com/Calendly URL.",
  },
  {
    n: 5,
    severity: "blocker",
    title: "Email capture endpoint",
    detail:
      "links.betaEndpoint is empty. Until it's set, the beta form falls back to a mailto. Formspark or a Cloudflare Worker both work.",
  },
  {
    n: 6,
    severity: "blocker",
    title: "“Treatment Estimator” is not what the product calls it",
    detail:
      "The app calls it the Financial Options Form everywhere, under a “Patient Forms” nav group. The brief calls it the Treatment Estimator. I used the real product name so the site matches what a buyer sees on the call. If you're renaming it, change it in demo.panels.estimate and the pains list.",
  },
  {
    n: 7,
    severity: "blocker",
    title: "The app's sidebar still says “TimeVault”",
    detail:
      "The rebrand is partial: the auth screen, outbound email and page title say Purple Envelope, but AppLayout.tsx:188 still renders TimeVault. Anyone who books a call and sees a screen share gets a different brand than the site. Worth fixing before you drive traffic here. (Also: index.html:22 points at /pwa-192x192.png, which doesn't exist — only the SVG does.)",
  },
  {
    n: 8,
    severity: "check",
    title: "“Closing duties” vs “Checklists”",
    detail:
      "The product calls it Checklists, with Daily/Weekly/Monthly/Yearly cadences across four lists (Clerical, Clinical—Assistant, Clinical—Hygiene, Manager). The brief says “nightly closeout,” which isn't a name in the app. The site says “closing duties” in prose and uses the real list name in the demo. Tell me which you want to standardize on.",
  },
  {
    n: 9,
    severity: "check",
    title: "Setup hours",
    detail:
      "The pricing page says onboarding is 'a couple of sessions and some homework' because I don't know the real number. You do. Put it in pricing.unpleasant.",
  },
  {
    n: 10,
    severity: "check",
    title: "Your photo",
    detail:
      "The founder section is an empty frame with a note. No stock photo was used and none should be. Send a real one.",
  },
  {
    n: 11,
    severity: "check",
    title: "Six video slots are empty",
    detail:
      "Five 45-second ones and the long walkthrough. Frames are built and labelled; drop files in /public/video/ and set src in `videos`.",
  },
  {
    n: 12,
    severity: "check",
    title: "megan@purpleenvelope.app",
    detail: "I assumed this address. Confirm it exists or change links.contactEmail.",
  },
  {
    n: 13,
    severity: "check",
    title: "Terms and privacy pages don't exist",
    detail:
      "Deliberately not linked rather than linked to nothing. ROADMAP.md line 12 still has the ToS unchecked.",
  },
  {
    n: 14,
    severity: "check",
    title: "The 60% number",
    detail:
      "'The office was up 60%' is from the brief and is yours to stand behind. It's the only statistic on the site. If it needs a qualifier (up 60% in collections? over what period?), say so — a vague number is the one thing that could undercut the whole approach.",
  },
];
