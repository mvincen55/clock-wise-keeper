/** Synthetic dashboard only. No session, data queries or writes. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import OwnerDashboard from '../src/components/dashboard/OwnerDashboard';
import ManagerDashboard from '../src/components/dashboard/ManagerDashboard';
import MemberDashboard from '../src/components/dashboard/MemberDashboard';
import { fxCloseoutHistory, fxPerformance, ownerFixture, managerFixture, hygienistFixture } from '../src/components/dashboard/fixtures';
import { buildGoalBrief } from '../src/lib/owner-pulse';
import '../src/index.css';

const role = new URLSearchParams(location.search).get('role') ?? 'manager';
const admin = role !== 'member';
const days = fxCloseoutHistory('2024-01-01', '2026-09-29', { complete: true });
const { block } = fxPerformance({ role: admin ? role === 'owner' ? 'owner' : 'manager' : 'employee', days, targets: { productionCents: 18000000, collectionsCents: 16000000, newPatientsSeen: 40 }, officePhase: 'open', today: '2026-09-30' });
const goal = buildGoalBrief([{ id: 'fx-office-goal', title: 'Morning huddle on time', metric: 'days', progress: 18, target_count: 20, starts_on: '2026-09-01', ends_on: '2026-09-30', status: 'active' }], '2026-09-30');
const header = { ...managerFixture.header, personName: role === 'member' ? 'Good afternoon, Dana' : 'Good afternoon, Megan', dateLabel: 'Wed, Sep 30, 2026' };
createRoot(document.getElementById('root')!).render(<MemoryRouter><style>{`@media (min-width: 768px) { .qa-app { padding-left: 240px; } .qa-nav { display: block; width: 240px; } }`}</style><div className="qa-app min-h-screen bg-background"><aside aria-label="App navigation" className="qa-nav fixed inset-y-0 left-0 hidden w-60 border-r border-border bg-sidebar p-5 text-sidebar-foreground md:block"><strong>Purple Envelope</strong><p className="mt-8 rounded-lg bg-sidebar-accent px-3 py-2 text-sm">Home</p><p className="px-3 py-3 text-sm">My work</p><p className="px-3 py-3 text-sm">Team</p><p className="px-3 py-3 text-sm">Reports</p></aside><div className="border-b border-border bg-primary px-6 py-3 text-primary-foreground"><strong>Purple Envelope</strong><span className="text-sm opacity-80" style={{ marginLeft: 16 }}>Dashboard preview · sample data</span></div>{role === 'owner' ? <OwnerDashboard view={{ ...ownerFixture, ...block, header, goal }} /> : role === 'member' ? <MemberDashboard view={{ ...hygienistFixture, ...block, header, goal }} /> : <ManagerDashboard view={{ ...managerFixture, ...block, header, goal }} />}</div></MemoryRouter>);
