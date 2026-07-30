import { useState } from "react";
import { Button, FieldLabel, Perforation, cx } from "./Primitives";
import { cta, links } from "@/content/site";

/** Renders when a required link is missing, so nothing ships silently broken. */
function MissingLink({ what, field }: { what: string; field: string }) {
  return (
    <p
      data-todo="intentional"
      className="border border-flag/50 bg-flag/5 px-4 py-3 text-[0.9rem] leading-relaxed text-flag"
    >
      <strong className="font-semibold">TODO(megan):</strong> {what} Set{" "}
      <code className="font-mono text-[0.85rem]">{field}</code> in{" "}
      <code className="font-mono text-[0.85rem]">src/content/site.ts</code>.
    </p>
  );
}

function BetaForm({ dark }: { dark: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "invalid" | "failed">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setState("invalid");
      return;
    }
    if (!links.betaEndpoint) {
      window.location.href = `mailto:${links.contactEmail}?subject=Beta list&body=${encodeURIComponent(
        `Add me to the beta list: ${email}`,
      )}`;
      setState("done");
      return;
    }
    setState("sending");
    try {
      const res = await fetch(links.betaEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email }),
      });
      setState(res.ok ? "done" : "failed");
    } catch {
      setState("failed");
    }
  }

  if (state === "done") {
    return (
      <p
        className={cx(
          "border px-4 py-3 text-[0.95rem]",
          dark ? "border-purple-200 bg-white/10 text-white" : "border-purple-600/40 bg-purple-50 text-purple-700",
        )}
      >
        {cta.secondary.success}
      </p>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <label htmlFor="beta-email" className={cx("pe-label", dark ? "text-purple-200" : "text-ink/60")}>
        {cta.secondary.label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="beta-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === "invalid" || state === "failed") setState("idle");
          }}
          placeholder={cta.secondary.placeholder}
          aria-describedby={state === "invalid" || state === "failed" ? "beta-error" : undefined}
          aria-invalid={state === "invalid"}
          className={cx(
            "min-h-[48px] w-full border bg-white px-3 text-[0.98rem] text-ink placeholder:text-ink/35",
            state === "invalid" || state === "failed" ? "border-flag" : "border-ink/25",
          )}
        />
        <Button
          type="submit"
          variant={dark ? "outlineDark" : "outline"}
          disabled={state === "sending"}
          className="sm:w-auto"
        >
          {state === "sending" ? "Sending" : "Join the list"}
        </Button>
      </div>
      {(state === "invalid" || state === "failed") && (
        <p
          id="beta-error"
          role="alert"
          className={cx("text-[0.9rem]", dark ? "text-flag-light" : "text-flag")}
        >
          {state === "invalid" ? cta.secondary.errorInvalid : cta.secondary.errorSend}
        </p>
      )}
      <p className={cx("text-[0.9rem] leading-relaxed", dark ? "text-white/70" : "text-ink/55")}>
        {cta.secondary.note}
      </p>
    </form>
  );
}

export function Cta({ tone = "deep" }: { tone?: "deep" | "paper" }) {
  const dark = tone === "deep";
  return (
    <section
      id="book"
      aria-labelledby="book-h"
      className={cx(dark ? "bg-deep text-paper on-dark" : "bg-paper text-ink", "border-t border-carbon")}
    >
      <div className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-8 sm:py-24">
        <FieldLabel className={dark ? "text-purple-200" : "text-purple-600"}>
          Two ways in, and only two
        </FieldLabel>

        <h2 id="book-h" className="mt-5 max-w-[22ch] text-[clamp(2rem,7vw,3.4rem)]">
          Come look when you want to.
        </h2>

        <div className="mt-12 grid gap-10 md:grid-cols-[1.15fr_1fr] md:gap-16">
          {/* Primary: the booked call. */}
          <div>
            <div className={cx("border", dark ? "border-white/25" : "border-carbon")}>
              <div className="p-6 sm:p-8">
                <FieldLabel className={dark ? "text-purple-200" : "text-purple-600"}>
                  What happens on it
                </FieldLabel>
                <ul className="mt-5 space-y-3">
                  {cta.primary.what.map((w) => (
                    <li key={w} className="flex gap-3 text-[1rem] leading-relaxed">
                      <span aria-hidden="true" className={cx("mt-[9px] h-[6px] w-[6px] shrink-0", dark ? "bg-purple-200" : "bg-purple-600")} />
                      <span className={dark ? "text-white/85" : "text-ink/80"}>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Perforation />
              <div className="p-6 sm:p-8">
                {links.bookingUrl ? (
                  <Button
                    href={links.bookingUrl}
                    variant={dark ? "invert" : "primary"}
                    className="w-full sm:w-auto"
                  >
                    {cta.primary.label}
                  </Button>
                ) : (
                  <MissingLink
                    what="the primary call-to-action needs your booking link."
                    field="links.bookingUrl"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Secondary: the lower-commitment option. */}
          <div className="flex flex-col justify-between gap-8">
            <div className={cx("border p-6 sm:p-8", dark ? "border-white/25" : "border-carbon")}>
              <BetaForm dark={dark} />
            </div>
            <p
              className={cx(
                "border-l-2 pl-4 text-[0.98rem] leading-relaxed",
                dark ? "border-purple-200 text-white/80" : "border-purple-600 text-ink/75",
              )}
            >
              {cta.policy}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
