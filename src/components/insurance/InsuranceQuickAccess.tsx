/**
 * Insurance Desk quick access — compact icon shortcuts, each a real
 * search scoped to the selected manual. No decorative pills: every card
 * lands on matching sections with sources, or says nothing matched.
 */
import {
  ArrowDownRight,
  BadgeCheck,
  FileCheck,
  Repeat,
  Scale,
  ScrollText,
  Timer,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { INSURANCE_SHORTCUTS, type InsuranceShortcut } from '@/lib/insurance-desk';

const ICONS: Record<string, LucideIcon> = {
  claims: FileCheck,
  eligibility: BadgeCheck,
  frequency: Repeat,
  downgrades: ArrowDownRight,
  predetermination: ScrollText,
  'timely-filing': Timer,
  participation: Users,
  appeals: Scale,
};

export default function InsuranceQuickAccess({
  onSearch,
}: {
  onSearch: (shortcut: InsuranceShortcut) => void;
}) {
  return (
    <div className="shrink-0">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Quick access
      </p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-8">
        {INSURANCE_SHORTCUTS.map(shortcut => {
          const Icon = ICONS[shortcut.key] ?? FileCheck;
          return (
            <button
              key={shortcut.key}
              type="button"
              onClick={() => onSearch(shortcut)}
              title={shortcut.hint}
              className="group flex flex-col items-start gap-1 rounded-lg border border-border bg-card px-2.5 py-2 text-left shadow-sm transition-colors hover:border-primary/40"
            >
              <Icon className="h-4 w-4 text-primary/70 transition-colors group-hover:text-primary" />
              <span className="text-[11px] font-medium leading-tight text-foreground/85 group-hover:text-foreground">
                {shortcut.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
