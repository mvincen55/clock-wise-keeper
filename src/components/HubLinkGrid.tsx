import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';

export interface HubLink {
  to: string;
  icon: LucideIcon;
  label: string;
  description: string;
  managerOnly?: boolean;
}

export interface HubSection {
  title: string;
  links: HubLink[];
}

/** Grouped destination grid used by the Workplace and Practice Playbook hubs. */
export default function HubLinkGrid({ sections, isManager }: { sections: HubSection[]; isManager: boolean }) {
  return (
    <div className="space-y-8">
      {sections.map(section => {
        const links = section.links.filter(l => !l.managerOnly || isManager);
        if (!links.length) return null;
        return (
          <section key={section.title} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {links.map(link => (
                <Link key={link.to} to={link.to} className="group">
                  <Card className="card-elevated h-full transition-colors group-hover:border-primary/40">
                    <CardContent className="flex items-start gap-3 p-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <link.icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium leading-tight">{link.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground leading-snug">{link.description}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
