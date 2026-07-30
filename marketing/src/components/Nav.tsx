import { Link, useLocation } from "react-router-dom";
import { Logo } from "./Logo";
import { cx } from "./Primitives";

/**
 * Nav is route-aware because the in-page anchors don't exist everywhere.
 * /your-data has no sandbox and no pricing block, so pointing at #try or
 * #price from there would be a dead link.
 */
const ANCHORS = [
  { href: "#what", label: "What it is" },
  { href: "#try", label: "Try it" },
  { href: "#price", label: "Price" },
];

export function Nav() {
  const { pathname } = useLocation();
  const onDataPage = pathname === "/your-data";

  return (
    <header className="sticky top-0 z-40 border-b border-carbon bg-paper/95 backdrop-blur-sm">
      <nav
        aria-label="Main"
        className="mx-auto flex w-full max-w-[1180px] items-center gap-4 px-5 py-3 sm:px-8"
      >
        <Link to="/" className="shrink-0" aria-label="Purple Envelope, home">
          <Logo size={26} />
        </Link>

        <ul className="ml-auto hidden items-center gap-6 text-[0.92rem] md:flex">
          {onDataPage ? (
            <>
              <li>
                <Link to="/" className="text-ink/70 transition-colors hover:text-ink">
                  For owners
                </Link>
              </li>
              <li>
                <Link to="/office-manager" className="text-ink/70 transition-colors hover:text-ink">
                  For office managers
                </Link>
              </li>
            </>
          ) : (
            <>
              {ANCHORS.map((i) => (
                <li key={i.href}>
                  <a href={i.href} className="text-ink/70 transition-colors hover:text-ink">
                    {i.label}
                  </a>
                </li>
              ))}
              <li>
                <Link to="/your-data" className="text-ink/70 transition-colors hover:text-ink">
                  Your data
                </Link>
              </li>
            </>
          )}
        </ul>

        <a
          href="#book"
          className={cx(
            "inline-flex min-h-[40px] items-center bg-purple-600 px-4 text-[0.85rem] font-medium text-white transition-colors hover:bg-purple-700",
            "ml-auto md:ml-0",
          )}
        >
          Book a call
        </a>
      </nav>
    </header>
  );
}
