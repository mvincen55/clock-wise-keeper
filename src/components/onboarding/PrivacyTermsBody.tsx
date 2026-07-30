import { ShieldCheck, Eye } from 'lucide-react';
import { PRIVACY_TERMS } from '@/lib/privacy-terms';

/** The plain-language terms — shown in onboarding and again from Settings. */
export default function PrivacyTermsBody() {
  return (
    <div className="space-y-5">
      {PRIVACY_TERMS.map((section, i) => (
        <section key={section.heading} className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            {i === 0 ? (
              <ShieldCheck className="h-4 w-4 text-primary" />
            ) : (
              <Eye className="h-4 w-4 text-primary" />
            )}
            {section.heading}
          </h3>
          {section.body.map(p => (
            <p key={p} className="text-sm leading-relaxed text-muted-foreground">
              {p}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}
