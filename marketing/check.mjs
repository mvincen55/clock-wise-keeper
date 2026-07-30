import { chromium } from "playwright";

const BASE = process.env.CHECK_BASE_URL || "http://127.0.0.1:4173";

/* CHROME_PATH lets a preinstalled browser be used instead of Playwright's own
   download, which is what CI images usually want. */
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
);
const problems = [];

for (const path of ["/", "/office-manager", "/your-data"]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${path} PAGEERROR ${e.message}`));
  await page.goto(BASE + path, { waitUntil: "networkidle" });

  // 1. Every in-page anchor must resolve to a real element.
  const dead = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="#"]')]
      .map((a) => a.getAttribute("href"))
      .filter((h) => h && h.length > 1 && !document.querySelector(h)),
  );
  for (const d of new Set(dead)) problems.push(`${path}: dead anchor ${d}`);

  // 2. No empty or placeholder hrefs shipped.
  const bad = await page.evaluate(() =>
    [...document.querySelectorAll("a")]
      .map((a) => a.getAttribute("href"))
      .filter((h) => h === "" || h === "#" || h === "undefined" || h === "null"),
  );
  for (const b of new Set(bad)) problems.push(`${path}: placeholder href ${JSON.stringify(b)}`);

  // 3. Accessibility basics.
  const a11y = await page.evaluate(() => {
    const out = [];
    if (document.querySelectorAll("h1").length !== 1)
      out.push(`h1 count = ${document.querySelectorAll("h1").length}`);
    const imgs = [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt"));
    if (imgs.length) out.push(`${imgs.length} img without alt`);
    const inputs = [...document.querySelectorAll("input")].filter((i) => {
      const id = i.getAttribute("id");
      return (
        !i.getAttribute("aria-label") &&
        !(id && document.querySelector(`label[for="${id}"]`)) &&
        !i.closest("label")
      );
    });
    if (inputs.length) out.push(`${inputs.length} input without label`);
    const btns = [...document.querySelectorAll("button")].filter(
      (b) => !b.textContent.trim() && !b.getAttribute("aria-label"),
    );
    if (btns.length) out.push(`${btns.length} button without name`);
    return out;
  });
  for (const a of a11y) problems.push(`${path}: ${a}`);

  // 4. The brand constraint: no rounded corners anywhere.
  const rounded = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      const s = getComputedStyle(el);
      for (const p of ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius"]) {
        const v = parseFloat(s[p]);
        if (v > 0.5) {
          out.push(`${el.tagName}.${(el.className || "").toString().slice(0, 40)} ${p}=${s[p]}`);
          break;
        }
      }
    }
    return out.slice(0, 10);
  });
  for (const r of rounded) problems.push(`${path}: ROUNDED ${r}`);

  // 5. Forbidden committee phrases and any external image (stock photo risk).
  const text = (await page.locator("body").innerText()).toLowerCase();
  const banned = [
    "empowering practices",
    "streamline your workflow",
    "elevate the patient experience",
    "all-in-one solution",
    "trusted partner",
    "best-in-class",
    "seamless",
    "cutting-edge",
    "revolutionize",
    "game-chang",
    "trusted by",
    "unlock",
    "supercharge",
  ];
  for (const b of banned) if (text.includes(b)) problems.push(`${path}: BANNED PHRASE "${b}"`);

  // 6b. Audit every visible TODO(megan). Allowed only inside a placeholder
  // frame (video / photo slot); anywhere else it is copy leaking to visitors.
  const todos = await page.evaluate(() =>
    [...document.querySelectorAll("*")]
      .filter((el) => !el.children.length && /TODO\(megan\)/.test(el.textContent || ""))
      .map((el) => ({
        text: (el.textContent || "").trim().slice(0, 60),
        /* Allowed inside a placeholder frame (video/photo slot) or on a block
           explicitly marked intentional, e.g. the missing-booking-link notice
           that must stay loud so the CTA can't ship broken. */
        inFrame: Boolean(el.closest("figure") || el.closest("[data-todo='intentional']")),
      })),
  );
  for (const t of todos)
    if (!t.inFrame) problems.push(`${path}: TODO LEAKED INTO COPY "${t.text}"`);

  const extImgs = await page.evaluate(() =>
    [...document.querySelectorAll("img, video")]
      .map((e) => e.getAttribute("src") || "")
      .filter((s) => /^https?:\/\//.test(s)),
  );
  for (const e of extImgs) problems.push(`${path}: external media ${e}`);

  // 6. Contrast of body text and small print against their backgrounds.
  const contrast = await page.evaluate(() => {
    const lum = (c) => {
      const [r, g, b] = c.map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const parse = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
    const bgOf = (el) => {
      let e = el;
      while (e) {
        const b = getComputedStyle(e).backgroundColor;
        const p = parse(b);
        if (p.length === 3 && !/rgba\(0, 0, 0, 0\)/.test(b)) {
          const alpha = b.startsWith("rgba") ? Number(b.split(",")[3]) : 1;
          if (alpha > 0.85) return p;
        }
        e = e.parentElement;
      }
      return [255, 255, 255];
    };
    const out = [];
    const els = [...document.querySelectorAll("p, li, dd, dt, span, a, h1, h2, h3, button, label")];
    for (const el of els) {
      if (!el.textContent.trim()) continue;
      if (el.children.length) continue;
      const st = getComputedStyle(el);
      const fg = parse(st.color);
      if (fg.length !== 3) continue;
      const bg = bgOf(el);
      const l1 = lum(fg), l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const size = parseFloat(st.fontSize);
      const bold = Number(st.fontWeight) >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);
      const need = large ? 3 : 4.5;
      if (ratio < need)
        out.push(`${ratio.toFixed(2)}:1 (need ${need}) ${st.fontSize} "${el.textContent.trim().slice(0, 45)}"`);
    }
    return [...new Set(out)].slice(0, 12);
  });
  for (const c of contrast) problems.push(`${path}: CONTRAST ${c}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? problems.join("\n") : "ALL CHECKS PASS");
