import { Link } from "react-router-dom";
import { EnvelopeMark } from "./Logo";
import { footer, links } from "@/content/site";

export function Footer({ crossLink }: { crossLink: { to: string; label: string } }) {
  return (
    <footer className="border-t border-carbon bg-paper">
      <div className="mx-auto w-full max-w-[1180px] px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <EnvelopeMark size={28} />
            <p className="mt-4 text-[0.95rem] leading-relaxed text-ink/70">{footer.line}</p>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-ink/55">{footer.noPhi}</p>
          </div>

          <nav aria-label="Footer" className="flex flex-col gap-3 text-[0.95rem]">
            <Link to={crossLink.to} className="text-ink/75 underline decoration-carbon underline-offset-4 hover:text-ink hover:decoration-purple-600">
              {crossLink.label} →
            </Link>
            <Link to="/your-data" className="text-ink/75 underline decoration-carbon underline-offset-4 hover:text-ink hover:decoration-purple-600">
              What you can verify
            </Link>
            <a
              href={`mailto:${links.contactEmail}`}
              className="text-ink/75 underline decoration-carbon underline-offset-4 hover:text-ink hover:decoration-purple-600"
            >
              {links.contactEmail}
            </a>
          </nav>
        </div>

        <p className="pe-label mt-10 border-t border-carbon pt-6 text-ink/45">
          purpleenvelope.app
        </p>
      </div>
    </footer>
  );
}
