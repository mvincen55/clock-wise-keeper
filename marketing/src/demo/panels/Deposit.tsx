import { useMemo, useState } from "react";
import { Button, FieldLabel, Perforation, cx } from "@/components/Primitives";
import { EnvelopeMark } from "@/components/Logo";
import { DemoNote } from "../DemoNote";
import { demo } from "@/content/site";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

const PREPARED_BY = "Dana Whitfield";
const INITIALS = "DW";

function MoneyInput({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  id: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="pe-label block text-ink/60">
        {label}
      </label>
      <div className="mt-1.5 flex items-center border border-ink/25 bg-white focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-purple-600">
        <span aria-hidden="true" className="pl-3 font-mono text-ink/40">
          $
        </span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          className="tnum min-h-[46px] w-full bg-transparent px-2 font-mono text-[1rem] text-ink outline-none"
        />
      </div>
    </div>
  );
}

export function DepositPanel() {
  const p = demo.panels.deposit;
  /* Seeded so it reads as a real day the moment you land on it. */
  const [cash, setCash] = useState("412.50");
  const [checks, setChecks] = useState<string[]>(["1250.00", "340.00", "86.20"]);
  const [insCards, setInsCards] = useState("2840.00");
  const [patCards, setPatCards] = useState("1105.75");
  const [financing, setFinancing] = useState("0");
  const [printed, setPrinted] = useState(false);

  const num = (s: string) => (Number.isFinite(parseFloat(s)) ? parseFloat(s) : 0);

  const t = useMemo(() => {
    const totalChecks = checks.reduce((a, c) => a + num(c), 0);
    const bank = num(cash) + totalChecks;
    const cards = num(insCards) + num(patCards) + num(financing);
    return { totalChecks, bank, cards, total: bank + cards };
  }, [cash, checks, insCards, patCards, financing]);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
      {/* ── Entry ── */}
      <div>
        <div className="border border-carbon bg-white">
          <div className="border-b border-carbon p-4 sm:p-5">
            <FieldLabel>{p.title}</FieldLabel>
            <p className="mt-1.5 text-[0.9rem] text-ink/55">{p.note}</p>
          </div>

          <div className="space-y-5 p-4 sm:p-5">
            <MoneyInput id="d-cash" label={p.fields.cash} value={cash} onChange={setCash} />

            <fieldset>
              <legend className="pe-label text-ink/60">{p.fields.checks}</legend>
              <div className="mt-1.5 space-y-2">
                {checks.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span aria-hidden="true" className="pe-label tnum w-5 shrink-0 text-right text-ink/35">
                      {i + 1}
                    </span>
                    <div className="flex flex-1 items-center border border-ink/25 bg-white focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-purple-600">
                      <span aria-hidden="true" className="pl-3 font-mono text-ink/40">
                        $
                      </span>
                      <input
                        aria-label={`Check ${i + 1} amount`}
                        type="text"
                        inputMode="decimal"
                        value={c}
                        onChange={(e) =>
                          setChecks((prev) =>
                            prev.map((v, j) => (j === i ? e.target.value.replace(/[^0-9.]/g, "") : v)),
                          )
                        }
                        className="tnum min-h-[46px] w-full bg-transparent px-2 font-mono text-[1rem] outline-none"
                      />
                    </div>
                    {checks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setChecks((prev) => prev.filter((_, j) => j !== i))}
                        aria-label={`Remove check ${i + 1}`}
                        className="min-h-[46px] min-w-[44px] border border-ink/20 text-ink/50 transition-colors hover:border-flag hover:text-flag"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <Button variant="ghost" onClick={() => setChecks((prev) => [...prev, ""])} className="mt-2 px-0">
                + {p.addCheck}
              </Button>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <MoneyInput id="d-ins" label={p.fields.insCards} value={insCards} onChange={setInsCards} />
              <MoneyInput id="d-pat" label={p.fields.patCards} value={patCards} onChange={setPatCards} />
            </div>
            <MoneyInput id="d-fin" label={p.fields.financing} value={financing} onChange={setFinancing} />
          </div>

          {/* Totals */}
          <dl className="border-t border-carbon bg-purple-50/60 p-4 sm:p-5">
            {[
              [p.totals.bank, t.bank],
              [`${p.totals.cards}`, t.cards],
            ].map(([k, v]) => (
              <div key={k as string} className="flex items-baseline justify-between gap-4 py-1.5">
                <dt className="text-[0.95rem] text-ink/70">{k as string}</dt>
                <dd className="tnum font-mono text-[1rem]">{money(v as number)}</dd>
              </div>
            ))}
            <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-purple-600/30 pt-3">
              <dt className="pe-label text-purple-700">{p.totals.total}</dt>
              <dd className="pe-num text-[1.5rem]">{money(t.total)}</dd>
            </div>
          </dl>

          <div className="border-t border-carbon p-4 sm:p-5">
            <Button onClick={() => setPrinted(true)} className="w-full sm:w-auto">
              {p.print}
            </Button>
          </div>
        </div>

        <DemoNote className="mt-4" k={p.noBalance.k} v={p.noBalance.v} status={p.noBalance.status} />
      </div>

      {/* ── The two copies. The signature element, doing its actual job. ── */}
      <div>
        {printed ? (
          <div aria-live="polite">
            <div className="pe-sheet">
              <CopyHead title={p.officeCopy} />
              <div className="px-5 pb-5">
                <Rows
                  rows={[
                    [p.fields.cash, money(num(cash))],
                    [`${p.fields.checks} (${checks.length})`, money(t.totalChecks)],
                    [p.fields.insCards, money(num(insCards))],
                    [p.fields.patCards, money(num(patCards))],
                    [p.fields.financing, money(num(financing))],
                  ]}
                />
                <div className="mt-4 border border-carbon">
                  <p className="pe-label border-b border-carbon bg-purple-50 px-3 py-2 text-purple-700">
                    {p.split.label}
                  </p>
                  <Rows compact rows={[[p.split.a, money(t.bank)], [p.split.b, money(t.cards)]]} className="px-3 py-1" />
                </div>
                <div className="mt-4 flex items-baseline justify-between border-t-2 border-purple-600 pt-3">
                  <span className="pe-label text-purple-700">{p.totals.total}</span>
                  <span className="pe-num text-[1.4rem]">{money(t.total)}</span>
                </div>
                <Signature />
                <p className="pe-label mt-4 text-ink/40">{p.officeFooter}</p>
              </div>
            </div>

            {/* The tear line between the two copies. */}
            <Perforation />

            <div className="pe-carbon-copy">
              <CopyHead title={p.bankCopy} carbon />
              <div className="px-5 pb-5">
                <Rows
                  carbon
                  rows={[
                    [p.fields.cash, money(num(cash))],
                    [`${p.fields.checks} (${checks.length})`, money(t.totalChecks)],
                  ]}
                />
                <div className="mt-4 border border-purple-600/30 bg-white/40 px-3 py-2">
                  <p className="pe-label text-purple-700">Deposit to</p>
                  <p className="mt-1 text-[0.95rem] text-ink/75">{p.split.a}</p>
                </div>
                <div className="mt-4 flex items-baseline justify-between border-t-2 border-purple-600 pt-3">
                  <span className="pe-label text-purple-700">Bank total</span>
                  <span className="pe-num text-[1.4rem] text-ink">{money(t.bank)}</span>
                </div>
                <Signature carbon />
                {/* The line the product is named after. */}
                <p className="pe-label mt-4 border border-purple-600/40 px-3 py-2 text-center text-purple-700">
                  {p.bankFooter}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center border border-dashed border-ink/25 bg-white p-8 text-center">
            <EnvelopeMark size={38} />
            <p className="mt-4 max-w-[30ch] text-[0.98rem] leading-relaxed text-ink/60">
              Change the amounts, then print. Two copies come out of one record — office copy to
              file, bank copy for the envelope.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function CopyHead({ title, carbon }: { title: string; carbon?: boolean }) {
  return (
    <div className={cx("flex items-center justify-between gap-3 border-b p-4 sm:p-5", carbon ? "border-purple-600/25" : "border-carbon")}>
      <div className="flex items-center gap-2.5">
        <EnvelopeMark size={22} />
        <span className="pe-h3 text-[0.98rem]">Deposit Log</span>
      </div>
      <span className="pe-label text-purple-700">{title}</span>
    </div>
  );
}

function Rows({
  rows,
  carbon,
  compact,
  className = "",
}: {
  rows: Array<[string, string]>;
  carbon?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <dl className={cx(!compact && "pt-4", className)}>
      {rows.map(([k, v]) => (
        <div
          key={k}
          className={cx(
            "flex items-baseline justify-between gap-4 border-b py-2 last:border-0",
            carbon ? "border-purple-600/15" : "border-carbon",
          )}
        >
          <dt className={cx("text-[0.92rem]", carbon ? "text-ink/60" : "text-ink/65")}>{k}</dt>
          <dd className="tnum font-mono text-[0.95rem]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Signature({ carbon }: { carbon?: boolean }) {
  const p = demo.panels.deposit;
  return (
    <div className={cx("mt-5 flex items-end gap-4 border-t pt-4", carbon ? "border-purple-600/20" : "border-carbon")}>
      <div className="flex-1">
        <p className="pe-label text-ink/45">{p.preparedBy}</p>
        <p className="mt-1 text-[0.95rem]">{PREPARED_BY}</p>
      </div>
      <div className="w-20 text-center">
        <p className="pe-label text-ink/45">{p.initials}</p>
        <p className="tnum mt-1 border border-ink/20 py-1 font-mono text-[0.95rem]">{INITIALS}</p>
      </div>
    </div>
  );
}
