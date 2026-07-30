import { useState } from "react";
import { Button, FieldLabel, Perforation } from "./Primitives";
import { officeManager, links } from "@/content/site";

/** Copies an absolute URL that survives a paste into an email. */
function doctorUrl() {
  if (typeof window !== "undefined" && window.location.origin.startsWith("http")) {
    return `${window.location.origin}/`;
  }
  return `${links.siteUrl}/`;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* Clipboard API needs a secure context and can be blocked. Fall back to a
       hidden textarea + execCommand so the button still works. */
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

export function SendToDoctor() {
  const c = officeManager.sendToDoctor;
  const [copied, setCopied] = useState<"none" | "link" | "email" | "failed">("none");
  const url = doctorUrl();

  async function copyLink() {
    setCopied((await copy(url)) ? "link" : "failed");
  }

  async function copyEmail() {
    const body = c.emailBody.replace("{{URL}}", url);
    const ok = await copy(`Subject: ${c.emailSubject}\n\n${body}`);
    setCopied(ok ? "email" : "failed");
  }

  return (
    <section id="send" aria-labelledby="send-h" className="border-t border-carbon bg-purple-600 text-white on-dark">
      <div className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-8 sm:py-24">
        <FieldLabel className="text-purple-200">{c.label}</FieldLabel>
        <h2 id="send-h" className="mt-5 max-w-[22ch] text-[clamp(2rem,7vw,3.4rem)]">
          {c.h2}
        </h2>
        <p className="mt-6 max-w-prose text-[1.05rem] leading-relaxed text-white/85">{c.body}</p>

        <div className="mt-10 border border-white/30 bg-white/[0.06]">
          <div className="p-6 sm:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button onClick={copyLink} variant="invert">
                {c.button}
              </Button>
              <Button onClick={copyEmail} variant="outlineDark">
                {c.emailButton}
              </Button>
            </div>

            {/* Shows the actual URL so it's obvious what lands in the paste. */}
            <p className="mt-5 font-mono text-[0.9rem] text-white/70">{url}</p>

            <p role="status" aria-live="polite" className="mt-3 min-h-[1.5rem] text-[0.95rem] text-purple-200">
              {copied === "link" && c.copied}
              {copied === "email" && c.emailCopied}
              {copied === "failed" && "Copying was blocked. Select the address above and copy it."}
            </p>
          </div>

          <Perforation />

          <details className="group p-6 sm:p-8">
            <summary className="cursor-pointer text-[0.98rem] text-white/85 underline decoration-white/40 underline-offset-4 hover:decoration-white">
              Read the email before you send it
            </summary>
            <pre className="mt-5 whitespace-pre-wrap border border-white/25 bg-deep/40 p-4 font-mono text-[0.85rem] leading-relaxed text-white/80">
              {c.emailBody.replace("{{URL}}", url)}
            </pre>
          </details>
        </div>
      </div>
    </section>
  );
}
