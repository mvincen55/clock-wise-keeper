# Purple Envelope — marketing site

The public site for **purpleenvelope.app**. Separate from the product app in
`../src` on purpose: this ships no Supabase, no Capacitor and no auth, so it
loads fast on a phone, which is where nearly all the ad traffic lands. The
product app also owns `/` for its dashboard, so the two cannot share a router.

Plain React + Vite + TypeScript + Tailwind. Not built in Lovable.

```sh
cd marketing
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check, then build to dist/
npm run check    # link, contrast, a11y and brand checks against a preview
```

## Editing copy and prices

**Everything editable lives in `src/content/site.ts`.** Wording, prices, the
pain list, the trust legs, the email to the doctor. You should never have to
open a component to change words or numbers.

At the bottom of that file is `PUBLISH_BLOCKERS`. Run `npm run dev` and a
banner in the corner lists every outstanding item. It does not appear in a
production build.

Two things must be set before the site goes live:

| Field in `site.ts` | What it needs |
| --- | --- |
| `links.bookingUrl` | Your Cal.com / Calendly link. While empty, the primary CTA renders a visible red placeholder rather than a dead button. |
| `links.betaEndpoint` | Anything that accepts `POST {email}`. While empty, the form falls back to a `mailto:`. |

## Design constraints that are enforced, not remembered

- **No rounded corners.** Every `borderRadius` token in `tailwind.config.ts`
  is `0`, so a rounded corner cannot be introduced by accident. `npm run check`
  fails if a computed radius appears anywhere.
- **`#53406e` anchors the palette** — it is the ground of whole sections, not a
  decorative accent. Six tokens total, in `tailwind.config.ts` and `index.css`.
- **The signature element** is the carbonless two-copy form set: `.pe-sheet`,
  `.pe-perf` (the tear line) and `.pe-carbon-copy`. The deposit log in the
  sandbox prints an office copy and a bank copy through it, which is the same
  thing the real product does.
- **Fonts are self-hosted, Latin subsets only.** Archivo is declared by hand in
  `index.css` because the display face needs both the weight and width axes.
- No stock photography. No invented statistics, testimonials or customer
  counts. The founder photo and all six video slots are empty labelled frames
  until real files exist.

## The sandbox

`src/demo/` is front-end only, seeded with fake names, no network, resettable.
Each panel carries an honest status: **in the product today** or **designed,
not built yet**. Where the product doesn't do something, the panel says so
instead of acting it out — see `PUBLISH_BLOCKERS` #3 for the one place this
departs from the original brief, and why.

## Deploying to Cloudflare Pages

| Setting | Value |
| --- | --- |
| Root directory | `marketing` |
| Build command | `npm run build` |
| Output directory | `dist` |

`public/_redirects` gives the SPA its history fallback and `public/_headers`
sets security headers plus immutable caching for hashed assets.
