/**
 * Morning Huddle — the meeting agenda, on screen. Deliberately stores
 * NOTHING: the discussion (which naturally involves patients) stays
 * verbal, so no patient information ever reaches the database. Content
 * mirrors the office's "Morning Huddle Info" doc.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sunrise, History, CalendarCheck, Telescope } from 'lucide-react';

const AGENDA: { title: string; icon: typeof History; items: (string | { text: string; sub: string[] })[] }[] = [
  {
    title: 'Take a Look Back',
    icon: History,
    items: [
      'A win from yesterday!',
      'Any patient upsets yesterday?',
      'Any follow-up calls to be made?',
    ],
  },
  {
    title: 'Take a Look at Today',
    icon: CalendarCheck,
    items: [
      'Any voicemails or text messages?',
      'Any openings or cancellations for today?',
      'Next available emergency time',
      'Hyg: any patients with treatment plans the doctor needs to be aware of?',
      {
        text: 'Clinical team: any follow-up the clerical team needs to be aware of?',
        sub: ['FMX eligibility, fluoride age limits, obtain correspondence, etc.'],
      },
      'Check next hygiene scheduled for patients and family',
    ],
  },
  {
    title: 'Take a Look Forward',
    icon: Telescope,
    items: [
      'Any openings for tomorrow?',
      {
        text: 'Any new patients in the next three days?',
        sub: ["Do we need to follow up on obtaining the NP's x-rays?"],
      },
      'Lab cases here for the next two days?',
      'Anything else unusual or noteworthy?',
    ],
  },
];

export default function MorningHuddle() {
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sunrise className="h-6 w-6" />
          Morning Huddle
        </h1>
        <p className="text-muted-foreground text-sm">
          The daily huddle agenda. Talk through each item — nothing here is written down or
          stored, so patient details stay in the room.
        </p>
      </div>

      {AGENDA.map((section, si) => (
        <Card key={section.title}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <section.icon className="h-4 w-4 text-primary" />
              {si + 1}. {section.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {section.items.map((item, i) => {
                const text = typeof item === 'string' ? item : item.text;
                const sub = typeof item === 'string' ? [] : item.sub;
                return (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
                    <div>
                      <span>{text}</span>
                      {sub.map((s, j) => (
                        <p key={j} className="text-xs text-muted-foreground">{s}</p>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
