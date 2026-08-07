import { useCallback, useEffect, useState } from 'react';

/**
 * PUBLIC MARKETING PERSONALIZATION ONLY.
 *
 * This value decides which words a visitor reads on the public website.
 * It never touches authentication, org membership, permissions, RLS or any
 * signed-in behaviour — real roles come from the authenticated Purple
 * Envelope account (org_members.role) and nothing else. It is stored in
 * localStorage purely so the marketing site remembers a reader's choice.
 */
export type MarketingRole = 'owner' | 'manager' | 'team' | 'exploring';

const STORAGE_KEY = 'pe_marketing_view';
const CHANGE_EVENT = 'pe-marketing-view-change';

export const MARKETING_ROLES: { id: MarketingRole; label: string; sub: string }[] = [
  { id: 'owner', label: 'Dentist / Owner', sub: 'You own the practice' },
  { id: 'manager', label: 'Office Manager', sub: 'You hold the office together' },
  { id: 'team', label: 'Team Member', sub: 'Front desk, hygiene, assisting' },
  { id: 'exploring', label: "I'm just exploring", sub: 'Show me the whole thing' },
];

function read(): MarketingRole {
  if (typeof window === 'undefined') return 'exploring';
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === 'owner' || raw === 'manager' || raw === 'team' ? raw : 'exploring';
}

/** Reads and writes the marketing-only view preference, synced across components. */
export function useMarketingRole(): [MarketingRole, (next: MarketingRole) => void] {
  const [role, setRole] = useState<MarketingRole>(() => read());

  useEffect(() => {
    const sync = () => setRole(read());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const update = useCallback((next: MarketingRole) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private browsing — the choice just won't persist */
    }
    setRole(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return [role, update];
}

export interface RoleStory {
  /** Short line under the role selector. */
  headline: string;
  lede: string;
  /** Three concrete things that change for this person. */
  points: { title: string; body: string }[];
  /** A sentence in their own voice — the thing they'd actually say. */
  recognition: string;
}

export const ROLE_STORIES: Record<MarketingRole, RoleStory> = {
  owner: {
    headline: 'See the office without becoming the office manager.',
    lede:
      'You hired people to run the office so you could do dentistry. Purple Envelope shows you whether the systems you put in place are actually being followed — without you standing over anyone.',
    points: [
      {
        title: 'Know what needs you, and only what needs you',
        body:
          'Approvals, unresolved requests and escalations that have actually reached you sit in one queue. Everything else stays where it belongs — with the person responsible.',
      },
      {
        title: 'Find out early, not at the end of the month',
        body:
          'Missed checklists, bypassed close-outs, unacknowledged policies and repeated exceptions surface as patterns while you can still do something about them.',
      },
      {
        title: 'The office keeps working when someone leaves',
        body:
          'Handbook, procedures, insurance notes and training live in the practice, not in one person’s memory. Turnover stops being an operational emergency.',
      },
    ],
    recognition: '“I don’t want to micromanage. I want to know it’s handled.”',
  },
  manager: {
    headline: 'Stop being the place where every unfinished thought has to live.',
    lede:
      'Purple Envelope was built inside a real independent dental office, from the manager’s side of the desk. The goal is simple: give you systems instead of asking you to personally be the system.',
    points: [
      {
        title: 'Fewer things living only in your head',
        body:
          'Assignments, acknowledgments, requests, PTO, corrections and follow-up have a real home with a status, an owner and a date — instead of a sticky note and a good memory.',
      },
      {
        title: 'Stop chasing every person for every task',
        body:
          'Reminders and escalation run on the assigned person’s actual working days. If someone is out, off, or blocked by someone else, the system knows and says so.',
      },
      {
        title: 'Say it once, in writing, where people can find it',
        body:
          'Publish a policy or procedure, assign it, and see exactly who has read that exact version. No more “nobody told me.”',
      },
    ],
    recognition: '“If I’m out for three days, does the office still know how to run?”',
  },
  team: {
    headline: 'Know what’s expected, where to find it, and what happens next.',
    lede:
      'Accountability that you can see is fairer than accountability you have to guess at. Purple Envelope gives you one place for what you’re responsible for and one place to look things up.',
    points: [
      {
        title: 'One place for what’s assigned to you',
        body:
          'Checklists, training, policies to read and things due today — on your phone, in the order they matter.',
      },
      {
        title: 'Look it up instead of asking three people',
        body:
          'The office handbook, procedures and insurance notes are searchable and current, so you get the same answer no matter who’s working.',
      },
      {
        title: 'Requests that don’t disappear',
        body:
          'Time off, punch corrections and questions have a visible status. You can see where your request is and who has it.',
      },
    ],
    recognition: '“I’d rather be told the rule than be corrected for missing it.”',
  },
  exploring: {
    headline: 'Practice operations for independent dental offices.',
    lede:
      'The daily workflow, the training, the office knowledge, the approvals and the follow-through — in one system that the whole office actually shares.',
    points: [
      {
        title: 'Run the day',
        body:
          'Opening and closing checklists, Close the Day, deposit log, office calendar, time and attendance.',
      },
      {
        title: 'Keep expectations clear',
        body:
          'Published policies, assignments and acknowledgments of the exact version, with approvals and requests that have a status.',
      },
      {
        title: 'Keep the knowledge in the practice',
        body:
          'Handbook, procedures, insurance desk and training that stay with the office rather than one person.',
      },
    ],
    recognition: '“You shouldn’t need thirty locations to run a tight ship.”',
  },
};
