import { useState } from "react";
import { FieldLabel, cx } from "@/components/Primitives";
import { DemoNote } from "../DemoNote";
import { demo } from "@/content/site";

/* Fake staff. The roles are what matter — the rule keys off the SUBJECT's
   role, not the author's. */
const SUBJECTS = [
  { id: "dana", name: "Dana Whitfield", role: "Assistant", needs: "manager" as const },
  { id: "ruth", name: "Ruth Calloway", role: "Office manager", needs: "owner" as const },
];

/* Two managers on purpose. Without a SECOND manager, the most important
   refusal — a different manager being turned away from a manager's report —
   would be unreachable, and that refusal is the entire claim. */
const SIGNERS = [
  { id: "ruth", name: "Ruth Calloway", role: "Office manager", level: "manager" as const },
  { id: "priya", name: "Priya Raman", role: "Office manager", level: "manager" as const },
  { id: "owner", name: "Dr. Alvarez", role: "Owner", level: "owner" as const },
];

type Outcome = { ok: boolean; msg: string } | null;

export function UpwardPanel() {
  const p = demo.panels.upward;
  const [subjectId, setSubjectId] = useState("dana");
  const [outcome, setOutcome] = useState<Outcome>(null);

  const subject = SUBJECTS.find((s) => s.id === subjectId)!;

  function sign(signerId: string) {
    const signer = SIGNERS.find((s) => s.id === signerId);
    /* Signing as the subject themselves. */
    if (!signer) {
      setOutcome({ ok: false, msg: p.blockedSelf });
      return;
    }
    if (subject.needs === "owner" && signer.level !== "owner") {
      setOutcome({ ok: false, msg: p.blockedManager });
      return;
    }
    setOutcome({ ok: true, msg: `${p.ok} Countersigned by ${signer.name}, ${signer.role.toLowerCase()}.` });
  }

  /* The subject can always attempt to sign their own report. */
  const selfSigner = { id: "__self", name: subject.name, role: subject.role };
  const options = [...SIGNERS.filter((s) => s.name !== subject.name), selfSigner];

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <div className="border border-carbon bg-white">
          <div className="border-b border-carbon p-4 sm:p-5">
            <FieldLabel>{p.title}</FieldLabel>
            <p className="mt-1.5 text-[0.9rem] text-ink/55">{p.note}</p>
          </div>

          {/* Who the report is about. */}
          <fieldset className="border-b border-carbon p-4 sm:p-5">
            <legend className="pe-label text-ink/60">{p.subjectLabel}</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {SUBJECTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={subjectId === s.id}
                  onClick={() => {
                    setSubjectId(s.id);
                    setOutcome(null);
                  }}
                  className={cx(
                    "min-h-[56px] border p-3 text-left transition-colors",
                    subjectId === s.id
                      ? "border-purple-600 bg-purple-50 outline outline-2 -outline-offset-2 outline-purple-600"
                      : "border-ink/25 bg-white hover:bg-purple-50",
                  )}
                >
                  <span className="block text-[0.98rem] font-medium">{s.name}</span>
                  <span className="pe-label mt-1 block text-ink/50">{s.role}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {/* What the system requires, derived from the subject. */}
          <div className="flex items-center justify-between gap-3 border-b border-carbon bg-purple-50/70 p-4 sm:p-5">
            <span className="pe-label text-ink/60">{p.needs}</span>
            <span className="pe-label border border-purple-600 bg-white px-2 py-1 text-purple-700">
              {subject.needs === "owner" ? "An owner" : "A manager or owner"}
            </span>
          </div>

          {/* Attempt a signature. */}
          <fieldset className="p-4 sm:p-5">
            <legend className="pe-label text-ink/60">{p.signAs}</legend>
            <div className="mt-3 flex flex-col gap-2">
              {options.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => sign(s.id)}
                  className="flex min-h-[52px] items-center justify-between gap-3 border border-ink/25 bg-white px-4 text-left transition-colors hover:border-purple-600 hover:bg-purple-50"
                >
                  <span className="text-[0.98rem]">{s.name}</span>
                  <span className="pe-label text-ink/50">
                    {s.id === "__self" ? "the subject" : s.role}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <div aria-live="polite" className="border-t border-carbon p-4 sm:p-5">
            {outcome ? (
              <p
                className={cx(
                  "border-l-2 py-1 pl-3 text-[0.95rem] leading-relaxed",
                  outcome.ok ? "border-purple-600 text-purple-700" : "border-flag text-flag",
                )}
              >
                {outcome.msg}
              </p>
            ) : (
              <p className="text-[0.95rem] text-ink/55">
                Pick someone to sign. Try signing a manager's report as another manager.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-[0.98rem] leading-relaxed text-ink/75">{p.point}</p>
        <DemoNote k={p.lateness.k} v={p.lateness.v} status={p.lateness.status} />
        <DemoNote k={p.chain.k} v={p.chain.v} status={p.chain.status} />
      </div>
    </div>
  );
}
