import { useMemo, useState } from "react";
import { Button, FieldLabel, Perforation, cx } from "@/components/Primitives";
import { EnvelopeMark } from "@/components/Logo";
import { DemoNote } from "../DemoNote";
import { demo } from "@/content/site";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/* Real CDT codes, fake patient. Categories drive the coverage percentage the
   way a carrier's plan table does. */
type Row = {
  /* Unique per line, not per code — two crowns on two teeth is the common
     case and both are legitimately D2740. */
  id: string;
  code: string;
  desc: string;
  tooth: string;
  fee: number;
  allowed: number;
  cat: "Preventive" | "Basic" | "Major";
};

/* Seeded as a two-crown case on purpose: it puts the patient's portion over
   the day-of-service cap, which is what makes the real visit-based payment
   plan appear instead of a single "due today" line. */
const SEED: Row[] = [
  { id: "l1", code: "D0220", desc: "Periapical first radiograph", tooth: "—", fee: 42, allowed: 28, cat: "Preventive" },
  { id: "l2", code: "D2950", desc: "Core buildup, including any pins", tooth: "19", fee: 310, allowed: 236, cat: "Basic" },
  { id: "l3", code: "D2740", desc: "Crown — porcelain/ceramic", tooth: "19", fee: 1480, allowed: 1085, cat: "Major" },
  { id: "l4", code: "D2740", desc: "Crown — porcelain/ceramic", tooth: "30", fee: 1480, allowed: 1085, cat: "Major" },
];

const COVERAGE: Record<Row["cat"], number> = { Preventive: 1, Basic: 0.8, Major: 0.5 };
const PREPAY_DISCOUNT = 0.1;
/* From the product's visit-plan engine: amounts over this get split across
   the visits rather than all landing on day one. */
const DAY_OF_SERVICE_CAP = 1000;

export function EstimatePanel() {
  const p = demo.panels.estimate;
  const [rows, setRows] = useState<Row[]>(SEED);
  const [printed, setPrinted] = useState(false);

  const calc = useMemo(() => {
    const lines = rows.map((r) => {
      const insurance = Math.round(r.allowed * COVERAGE[r.cat] * 100) / 100;
      return { ...r, insurance, patient: Math.round((r.allowed - insurance) * 100) / 100, writeOff: r.fee - r.allowed };
    });
    const patient = lines.reduce((a, l) => a + l.patient, 0);
    const insurance = lines.reduce((a, l) => a + l.insurance, 0);
    const writeOff = lines.reduce((a, l) => a + l.writeOff, 0);
    const prepay = Math.round(patient * (1 - PREPAY_DISCOUNT) * 100) / 100;

    /* Two visits for a crown: prep and delivery. Front-load, but never put
       more than the cap on the first visit. */
    const plan =
      patient > DAY_OF_SERVICE_CAP
        ? [
            { when: "Upon scheduling", amt: Math.round(patient * 0.5 * 100) / 100 },
            { when: "At prep appointment", amt: Math.round(patient * 0.25 * 100) / 100 },
            { when: "On delivery", amt: Math.round((patient - Math.round(patient * 0.75 * 100) / 100) * 100) / 100 },
          ]
        : [{ when: "Due at time of service", amt: Math.round(patient * 100) / 100 }];

    return { lines, patient, insurance, writeOff, prepay, saves: Math.round((patient - prepay) * 100) / 100, plan };
  }, [rows]);

  function setFee(i: number, key: "fee" | "allowed", v: string) {
    const n = parseFloat(v.replace(/[^0-9.]/g, ""));
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [key]: Number.isFinite(n) ? n : 0 } : r)));
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr]">
      <div>
        <div className="border border-carbon bg-white">
          <div className="border-b border-carbon p-4 sm:p-5">
            <FieldLabel>{p.title}</FieldLabel>
            <p className="mt-1.5 text-[0.9rem] text-ink/55">{p.note}</p>
          </div>

          {/* Procedures. Fee and allowed are editable so the maths is visibly live. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left">
              <thead>
                <tr className="border-b border-carbon bg-purple-50/60">
                  {[p.cols.code, p.cols.desc, p.cols.fee, p.cols.allowed].map((c) => (
                    <th key={c} scope="col" className="pe-label px-3 py-2 text-ink/55">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-b border-carbon last:border-0">
                    <td className="px-3 py-2.5">
                      <span className="tnum font-mono text-[0.92rem]">{r.code}</span>
                      <span className="pe-label mt-0.5 block text-ink/40">{r.cat}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[0.92rem] leading-snug text-ink/75">
                      {r.desc}
                      {r.tooth !== "—" && <span className="pe-label ml-1.5 text-ink/40">#{r.tooth}</span>}
                    </td>
                    {(["fee", "allowed"] as const).map((k) => (
                      <td key={k} className="px-2 py-2">
                        <input
                          aria-label={`${r.code}${r.tooth !== "—" ? ` tooth ${r.tooth}` : ""} ${k === "fee" ? "office fee" : "allowed"}`}
                          type="text"
                          inputMode="decimal"
                          value={String(r[k])}
                          onChange={(e) => setFee(i, k, e.target.value)}
                          className="tnum min-h-[44px] w-[76px] border border-ink/20 bg-white px-2 font-mono text-[0.92rem]"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Live totals. */}
          <dl className="border-t border-carbon bg-purple-50/60 p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-4 py-1.5">
              <dt className="text-[0.95rem] text-ink/70">{p.insurance}</dt>
              <dd className="tnum font-mono text-[1rem]">{money(calc.insurance)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-purple-600/25 pt-3">
              <dt className="pe-label text-purple-700">{p.yourPortion}</dt>
              <dd className="pe-num text-[1.5rem]">{money(calc.patient)}</dd>
            </div>
          </dl>

          <div className="border-t border-carbon p-4 sm:p-5">
            <Button onClick={() => setPrinted(true)} className="w-full sm:w-auto">
              Print the form
            </Button>
          </div>
        </div>

        <DemoNote className="mt-4" k={p.wording.k} v={p.wording.v} status={p.wording.status} />
        <p className="mt-3 border-l-2 border-purple-600 pl-3 text-[0.9rem] leading-relaxed text-ink/60">
          {p.noPatientData}
        </p>
      </div>

      {/* The printed sheet. */}
      <div>
        {printed ? (
          <div aria-live="polite">
            <div className="pe-sheet">
              <div className="flex items-center justify-between gap-3 border-b border-carbon p-4 sm:p-5">
                <div className="flex items-center gap-2.5">
                  <EnvelopeMark size={22} />
                  <span className="pe-h3 text-[0.98rem]">Financial Options</span>
                </div>
                <span className="pe-label text-purple-700">{p.printPatient}</span>
              </div>

              <div className="p-5">
                <p className="pe-label text-ink/45">Patient</p>
                <p className="mt-1 text-[1rem]">Marcus Ellery</p>

                <div className="mt-5 border-2 border-purple-600 p-4 text-center">
                  <p className="pe-label text-purple-700">{p.yourPortion}</p>
                  <p className="pe-num mt-2 text-[2.4rem]">{money(calc.patient)}</p>
                </div>

                <div className="mt-5 grid gap-px bg-carbon sm:grid-cols-2">
                  <div className="bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="pe-label text-purple-700">{p.prepay}</p>
                      <span className="pe-label border border-purple-600 px-1.5 py-0.5 text-purple-700">
                        {p.youSave} {money(calc.saves)}
                      </span>
                    </div>
                    <p className="pe-num mt-3 text-[1.6rem]">{money(calc.prepay)}</p>
                    <p className="mt-2 text-[0.85rem] leading-relaxed text-ink/55">Paid in full before treatment starts.</p>
                  </div>
                  <div className="bg-white p-4">
                    <p className="pe-label text-purple-700">{p.installments}</p>
                    <ul className="mt-3 space-y-1.5">
                      {calc.plan.map((s) => (
                        <li key={s.when} className="flex items-baseline justify-between gap-3 text-[0.9rem]">
                          <span className="text-ink/70">{s.when}</span>
                          <span className="tnum font-mono">{money(s.amt)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-6 border-t border-carbon pt-4">
                  <p className="pe-label text-ink/45">Signature</p>
                  <div className="mt-3 h-8 border-b border-ink/30" />
                </div>
              </div>
            </div>

            <Perforation />

            {/* Page two prints automatically. */}
            <div className="pe-carbon-copy">
              <div className="flex items-center justify-between gap-3 border-b border-purple-600/25 p-4 sm:p-5">
                <span className="pe-h3 text-[0.98rem] text-ink">FOF detail</span>
                <span className="pe-label text-purple-700">{p.printOffice}</span>
              </div>
              <div className="overflow-x-auto p-4 sm:p-5">
                <table className="w-full min-w-[340px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-purple-600/25">
                      {["Code", "Tooth", "Fee", "Allowed", "Ins.", "Write-off"].map((c) => (
                        <th key={c} scope="col" className="pe-label py-1.5 pr-3 text-purple-700">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="tnum font-mono text-[0.85rem]">
                    {calc.lines.map((l) => (
                      <tr key={l.id} className="border-b border-purple-600/10 last:border-0">
                        <td className="py-1.5 pr-3">{l.code}</td>
                        <td className="py-1.5 pr-3">{l.tooth}</td>
                        <td className="py-1.5 pr-3">{money(l.fee)}</td>
                        <td className="py-1.5 pr-3">{money(l.allowed)}</td>
                        <td className="py-1.5 pr-3">{money(l.insurance)}</td>
                        <td className="py-1.5 pr-3">{money(l.writeOff)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className={cx("pe-label mt-4 text-ink/50")}>Total write-off {money(calc.writeOff)}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center border border-dashed border-ink/25 bg-white p-8 text-center">
            <EnvelopeMark size={38} />
            <p className="mt-4 max-w-[32ch] text-[0.98rem] leading-relaxed text-ink/60">
              Change a fee or an allowed amount and the patient's portion moves. Print to see both
              pages — the one the patient signs, and the office copy behind it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
