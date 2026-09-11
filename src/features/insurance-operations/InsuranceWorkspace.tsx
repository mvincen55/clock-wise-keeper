import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link, useBlocker, useLocation } from 'react-router-dom';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useAuth } from '@/hooks/useAuth';
import {
  useOrgBranding,
  GENERIC_BRANDING,
  type OrgBranding,
} from '@/hooks/useOrgBranding';
import { holdSensitiveSession } from '@/lib/sensitive-session';
import { Button } from '@/components/ui/button';
import {
  useInsuranceReferences,
  type ReferenceData,
} from './adapters/references';
import { InsuranceAlerts } from './adapters/alerts';
import { createSessionTransport } from './adapters/session-transport';
import type {
  SessionCapability,
  SessionTransport,
} from './adapters/call-contract';
import {
  applyEvent,
  applyPlan,
  completeness,
  finishWithoutCall,
  informationIssues,
  matchPlan,
  needsCall,
  type Task,
  type TaskEvent,
} from './domain/workflow';
import {
  genericRuleSchema,
  isGeneric,
  questionId,
  type GenericRule,
} from './domain/schema';
import {
  demoOrg,
  demoPayer,
  syntheticPlan,
  syntheticSettings,
  syntheticTasks,
} from './domain/synthetic';
import { Benefits } from './ui/Benefits';
import { PlanLibrary } from './ui/PlanLibrary';
import { SettingsPanel } from './ui/SettingsPanel';
import { Results } from './ui/Results';

const tabs = [
  ['benefits', 'Benefits'],
  ['plans', 'Plan Library'],
  ['claims', 'Claims'],
  ['manuals', 'Manuals'],
  ['settings', 'Settings'],
] as const;
export function InsuranceWorkspace({
  manuals,
}: {
  manuals: (sensitive: boolean) => ReactNode;
}) {
  const { data: ctx } = useOrgContext();
  const references = useInsuranceReferences(ctx?.org_id);
  const { data: branding } = useOrgBranding();
  const { session } = useAuth();
  const token = useRef(session?.access_token ?? '');
  token.current = session?.access_token ?? '';
  if (!ctx) return <p className="p-6">Loading office…</p>;
  return (
    <InsuranceSession
      key={`${ctx.org_id}:${ctx.user_id}`}
      orgId={ctx.org_id}
      userId={ctx.user_id}
      role={ctx.role}
      data={references.data}
      error={references.error?.message}
      refresh={() => {
        void references.refetch();
      }}
      branding={branding ?? GENERIC_BRANDING}
      manuals={manuals}
      getToken={async () => token.current}
    />
  );
}
export function InsuranceSession({
  orgId,
  userId,
  role,
  data,
  error,
  refresh,
  branding,
  manuals,
  getToken,
}: {
  orgId: string;
  userId: string;
  role: string;
  data?: ReferenceData;
  error?: string;
  refresh: () => void;
  branding: OrgBranding;
  manuals: (sensitive: boolean) => ReactNode;
  getToken: () => Promise<string>;
}) {
  const location = useLocation();
  const active = location.pathname.split('/')[2] || 'benefits';
  const [tasks, setTasks] = useState<Task[]>([]);
  const [synthetic, setSynthetic] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const [message, setMessage] = useState('');
  const [printing, setPrinting] = useState<string[]>([]);
  const [launchIds, setLaunchIds] = useState<string[]>([]);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [extraction, setExtraction] = useState<GenericRule[]>();
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const sessionRef = useRef<SessionCapability>();
  const transportRef = useRef<SessionTransport>();
  const epoch = useRef(0);
  const launchBusy = useRef(false);
  const [extractionVersion, setExtractionVersion] = useState(0);
  const abort = useRef<AbortController>();
  const cursor = useRef(0);
  const alerts = useRef(new InsuranceAlerts());
  const latest = useRef(tasks);
  latest.current = tasks;
  const fixture = useMemo<ReferenceData>(
    () => ({
      settings: syntheticSettings,
      settingsVersion: 1,
      versions: [syntheticPlan()],
      directory: [
        {
          id: demoPayer,
          org_id: demoOrg,
          label: 'Synthetic payer',
          value: 'Not a telephone destination',
        },
      ],
      providers: [],
      plans: [],
      schedules: [],
      manuals: [],
    }),
    [],
  );
  const refs = synthetic ? fixture : data;
  const settings = refs?.settings;
  const effectiveOrg = synthetic ? demoOrg : orgId;
  const manager = role === 'owner' || role === 'manager';
  // Hidden internal panels can still contain an unsubmitted import or document.
  const sensitive = tasks.length > 0 || active !== '';
  useLayoutEffect(
    () => (sensitive ? holdSensitiveSession() : undefined),
    [sensitive],
  );
  const clear = () => {
    epoch.current++;
    abort.current?.abort();
    const cap = sessionRef.current;
    const transport = transportRef.current;
    sessionRef.current = undefined;
    transportRef.current = undefined;
    cursor.current = 0;
    if (cap && transport)
      void transport.control(cap, 'clear').catch(() => undefined);
    setTasks([]);
    setPrinting([]);
    setLaunchIds([]);
    setBatchIds([]);
    setExtraction(undefined);
    setConnected(false);
    setPaused(false);
    setSessionId(crypto.randomUUID());
    setGeneration((g) => g + 1);
    alerts.current.clear();
  };
  useEffect(
    () => () => {
      epoch.current++;
      abort.current?.abort();
      alerts.current.clear();
      const cap = sessionRef.current;
      if (cap && transportRef.current)
        void transportRef.current.control(cap, 'clear').catch(() => undefined);
    },
    [],
  );
  useEffect(() => {
    if (!sensitive) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [sensitive]);
  const blocker = useBlocker(
    ({ nextLocation }) =>
      sensitive &&
      !(
        nextLocation.pathname === '/insurance-desk' ||
        nextLocation.pathname.startsWith('/insurance-desk/')
      ),
  );
  const matches = useMemo(
    () =>
      new Map(
        tasks.map((t) => [
          t.id,
          matchPlan(
            t,
            refs?.versions ?? [],
            effectiveOrg,
            new Date(),
            settings?.freshnessDays ?? 90,
          ),
        ]),
      ),
    [tasks, refs?.versions, effectiveOrg, settings?.freshnessDays],
  );
  const resolved = tasks.map((t) => {
    const m = matches.get(t.id);
    if (t.progress !== 'draft') return t;
    const resolvedTask =
      m?.state === 'matched' ? applyPlan(t, m.candidates[0]) : t;
    return {
      ...resolvedTask,
      billingPolicy: settings?.billingPolicies?.find(
        (p) => p.payerId === t.planIdentity.payerId,
      ),
    };
  });
  const update = (next: Task) =>
    setTasks((current) => current.map((t) => (t.id === next.id ? next : t)));
  const receive = useCallback((event: TaskEvent) => {
    cursor.current++;
    setTasks((current) =>
      current.map((t) => {
        if (t.id !== event.taskId || t.sessionId !== event.sessionId) return t;
        const newAttempt =
          !t.attempts.length ||
          (event.kind === 'started' &&
            t.attempts.at(-1)?.id !== event.attemptId);
        const prepared = newAttempt
          ? {
              ...t,
              progress: 'queued' as const,
              attempts: [
                ...t.attempts,
                {
                  id: event.attemptId,
                  number: t.attempts.length + 1,
                  startedAt: event.at,
                  launch: 'pending' as const,
                  lastSequence: 0,
                },
              ],
            }
          : t;
        return applyEvent(prepared, event);
      }),
    );
  }, []);
  const connect = useCallback(() => {
    const cap = sessionRef.current;
    const transport = transportRef.current;
    if (!cap || !transport) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const version = epoch.current;
    setConnected(true);
    void transport
      .events(cap, cursor.current, controller.signal, (e) => {
        if (version === epoch.current) receive(e);
      })
      .catch(() => {
        if (version === epoch.current && !controller.signal.aborted) {
          setConnected(false);
          setMessage(
            'Connection interrupted. Active calls may continue until the session expires. Reconnect to reconcile; do not relaunch.',
          );
        }
      });
  }, [receive]);
  useEffect(() => {
    const online = () => connect();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [connect]);
  useEffect(() => {
    const started = tasks.filter((t) => batchIds.includes(t.id));
    if (!started.length) return;
    for (const t of started)
      if (t.progress === 'needs_staff' && settings?.alerts.attention)
        alerts.current.show(
          `attention:${t.id}:${t.attempts.length}`,
          true,
          settings.alerts.sound,
        );
    if (
      started.every((t) =>
        ['finished', 'failed', 'cancelled', 'needs_staff'].includes(t.progress),
      ) &&
      settings?.alerts.completion
    )
      alerts.current.show(
        `done:${started
          .map((t) => `${t.id}:${t.attempts.length}`)
          .sort()
          .join('|')}`,
        false,
        settings.alerts.sound,
      );
  }, [tasks, batchIds, settings?.alerts]);
  useEffect(() => {
    if (data && !data.settings.enabled && !synthetic && tasks.length) {
      const cap = sessionRef.current;
      if (cap && transportRef.current)
        void transportRef.current.control(cap, 'clear').catch(() => undefined);
      setPaused(true);
      setMessage(
        'Operations disabled. New launches are blocked; cancellation of active calls was requested. Review and print remaining local results.',
      );
    }
  }, [data, synthetic, tasks.length]);
  const start = async () => {
    if (launchBusy.current) return;
    if (
      !settings?.enabled ||
      !settings.roles.includes(role as 'owner' | 'manager' | 'employee')
    ) {
      setMessage('Operations are disabled or your role is not authorized.');
      return;
    }
    const selected = resolved.filter(
      (t) => launchIds.includes(t.id) && t.progress === 'draft',
    );
    setLaunchIds([]);
    if (
      selected.some(
        (t) =>
          informationIssues(t).length ||
          (matches.get(t.id)?.state === 'review' &&
            t.kind !== 'eligibility' &&
            !t.forceFresh),
      )
    ) {
      setMessage(
        'Resolve row information and plan-match review before starting.',
      );
      return;
    }
    const cached = selected.filter((t) => !needsCall(t));
    const calls = selected.filter(needsCall);
    setBatchIds(selected.map((t) => t.id));
    setTasks((current) =>
      current.map((t) =>
        cached.some((c) => c.id === t.id)
          ? finishWithoutCall(cached.find((c) => c.id === t.id)!)
          : t,
      ),
    );
    if (!calls.length) {
      setMessage(
        'Requested answers completed from reviewed sources. No calling API usage.',
      );
      return;
    }
    const liveOrigin = import.meta.env.VITE_INSURANCE_RELAY_ORIGIN as
      string | undefined;
    if (!synthetic && !liveOrigin) {
      setMessage(
        'Live calls are blocked: approved relay and payer setup are required. Cached breakdowns remain available.',
      );
      return;
    }
    const version = epoch.current;
    launchBusy.current = true;
    try {
      const transport =
        transportRef.current ??
        createSessionTransport(
          synthetic ? 'http://127.0.0.1:8788' : liveOrigin!,
          synthetic ? async () => 'synthetic-only' : getToken,
          synthetic ? demoOrg : orgId,
        );
      transportRef.current = transport;
      const ready = await transport.readiness();
      if (!ready.ready || ready.mode !== (synthetic ? 'synthetic' : 'live'))
        throw new Error('Calling setup requirements are not satisfied.');
      const cap = sessionRef.current ?? (await transport.open());
      if (version !== epoch.current) {
        void transport.control(cap, 'clear').catch(() => undefined);
        return;
      }
      sessionRef.current = cap;
      setSessionId(cap.id);
      const queued = calls.map((t) => ({
        ...t,
        sessionId: cap.id,
        progress: 'queued' as const,
      }));
      setTasks((current) =>
        current.map(
          (t) =>
            queued.find((q) => q.id === t.id) ?? { ...t, sessionId: cap.id },
        ),
      );
      connect();
      await transport.start(cap, queued, settings.version);
      setMessage(
        synthetic
          ? 'Synthetic calls started in the local runtime. You may minimize this page.'
          : 'Authorized calls started in the configured runtime. Keep this page open.',
      );
    } catch {
      if (version === epoch.current)
        setMessage(
          'Calling runtime unavailable or launch outcome unknown. Check setup, then reconnect. Do not repeat an ambiguous launch.',
        );
    } finally {
      launchBusy.current = false;
    }
  };
  const cancel = (id: string) => {
    const cap = sessionRef.current;
    if (cap && transportRef.current)
      void transportRef.current
        .control(cap, 'cancel', id)
        .catch(() =>
          setMessage(
            'Cancellation could not be confirmed. The runtime expiry still applies.',
          ),
        );
    setTasks((current) =>
      current.map((t) => (t.id === id ? { ...t, progress: 'cancelled' } : t)),
    );
  };
  const nav = (
    <nav
      aria-label="Insurance Desk"
      className="flex flex-wrap gap-1 border-b px-4 py-3"
    >
      {tabs.map(([path, label]) => (
        <Link
          key={path}
          className={`rounded-md px-4 py-2 text-sm ${active === path ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          to={`/insurance-desk${path ? `/${path}` : ''}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
  return (
    <div>
      {nav}
      {active === 'manuals' ? (
        manuals(sensitive)
      ) : (
        <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Insurance Benefits</h1>
              <p className="text-sm text-muted-foreground">
                Keep this page open until results are printed; refreshing clears
                the session.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  const result = await alerts.current.enable();
                  setMessage(
                    result === 'granted'
                      ? 'Desktop alerts enabled.'
                      : 'Desktop alerts unavailable or denied. Use the in-page status and optional sound.',
                  );
                }}
              >
                Enable alerts
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  alerts.current.show(
                    `test:${Date.now()}`,
                    false,
                    settings?.alerts.sound,
                  )
                }
              >
                Test alert
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (
                    window.confirm(
                      'Clear all temporary rows, results and print documents?',
                    )
                  )
                    clear();
                }}
              >
                Clear session
              </Button>
            </div>
          </div>
          {active === 'claims' ? (
            <section className="rounded-lg border p-6">
              <h2 className="text-lg font-semibold">Claims — coming later</h2>
              <p>
                Claim status workflows will have their own questions and
                reports. No claim submission or investigation is available in
                this release.
              </p>
            </section>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <span className="text-sm font-medium">
                  {synthetic
                    ? 'Synthetic test mode — no live calls or payer facts'
                    : 'Office mode — live calling setup required'}
                </span>
                <Button
                  variant="outline"
                  disabled={tasks.length > 0}
                  onClick={() => {
                    clear();
                    setSynthetic((v) => !v);
                  }}
                >
                  {synthetic
                    ? 'Return to office mode'
                    : 'Use synthetic test mode'}
                </Button>
                {synthetic && (
                  <Button
                    variant="outline"
                    disabled={tasks.length > 0}
                    onClick={() => setTasks(syntheticTasks(sessionId))}
                  >
                    Load two synthetic rows
                  </Button>
                )}
              </div>
              {error && !synthetic && <p role="alert">{error}</p>}
              {refs && settings && (
                <>
                  {!settings.enabled && active === 'benefits' && (
                    <p className="rounded border p-4">
                      Insurance operations are disabled. An office manager can
                      enable them in{' '}
                      <Link className="underline" to="/insurance-desk/settings">
                        Settings
                      </Link>
                      . Manuals remain available.
                    </p>
                  )}
                  {sessionRef.current && (
                    <div className="flex gap-3 items-center">
                      <span className="text-sm">
                        {connected
                          ? 'Runtime connected'
                          : 'Connection needs attention'}{' '}
                        · {paused ? 'Launches paused' : 'Launches enabled'}
                      </span>
                      <Button variant="outline" onClick={connect}>
                        Reconnect
                      </Button>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          const cap = sessionRef.current;
                          if (!cap || !transportRef.current) return;
                          try {
                            await transportRef.current.control(
                              cap,
                              paused ? 'resume' : 'pause',
                            );
                            setPaused(!paused);
                          } catch {
                            setMessage('Could not confirm launch control.');
                          }
                        }}
                      >
                        {paused ? 'Resume remaining' : 'Pause remaining'}
                      </Button>
                    </div>
                  )}
                  {printing.length ? (
                    <Results
                      tasks={resolved.filter((t) => printing.includes(t.id))}
                      branding={branding}
                      synthetic={synthetic}
                      payerNames={Object.fromEntries(
                        refs.directory.map((d) => [d.id, d.label]),
                      )}
                      onClose={() => setPrinting([])}
                    />
                  ) : (
                    <>
                      <div hidden={active !== 'benefits'}>
                        {(settings.enabled || tasks.length > 0) && (
                          <Benefits
                            key={generation}
                            tasks={resolved}
                            settings={settings}
                            data={refs}
                            sessionId={sessionId}
                            synthetic={synthetic}
                            update={update}
                            add={(rows) =>
                              setTasks((current) =>
                                [...current, ...rows].slice(0, 200),
                              )
                            }
                            start={setLaunchIds}
                            cancel={cancel}
                            retry={async (id) => {
                              const cap = sessionRef.current;
                              if (!cap || !transportRef.current) return;
                              try {
                                await transportRef.current.control(
                                  cap,
                                  'retry',
                                  id,
                                );
                              } catch {
                                setMessage(
                                  'Retry blocked: verify remote status, unresolved scope and retry limit.',
                                );
                              }
                            }}
                            print={setPrinting}
                            matches={matches}
                            onExtract={(task) => {
                              const rules: GenericRule[] = [];
                              for (const q of task.questions) {
                                if (!isGeneric(q.key)) continue;
                                const answer = task.answers.find(
                                  (a) =>
                                    a.questionId === questionId(q) &&
                                    a.state === 'answered' &&
                                    ['ivr', 'representative'].includes(
                                      a.source,
                                    ),
                                );
                                const rule = genericRuleSchema.safeParse({
                                  key: q.key,
                                  scope: q.scope,
                                  status: 'confirmed',
                                  value: answer?.value,
                                });
                                if (rule.success) rules.push(rule.data);
                              }
                              setExtraction(rules);
                              setExtractionVersion((v) => v + 1);
                              setMessage(
                                'Generic candidates prepared in memory. Open Plan Library and review source and fields before publication.',
                              );
                            }}
                          />
                        )}
                      </div>
                      <div hidden={active !== 'plans'}>
                        {!synthetic ? (
                          <PlanLibrary
                            key={`${generation}:${extractionVersion}`}
                            data={refs}
                            orgId={orgId}
                            manager={manager}
                            onSaved={refresh}
                            extraction={extraction}
                          />
                        ) : (
                          <p>
                            Synthetic references are temporary and cannot be
                            published.
                          </p>
                        )}
                      </div>
                      <div hidden={active !== 'settings'}>
                        {!synthetic ? (
                          <SettingsPanel
                            key={refs.settingsVersion}
                            data={refs}
                            orgId={orgId}
                            manager={manager}
                            onSaved={refresh}
                          />
                        ) : (
                          <p>
                            Synthetic mode uses conservative training presets.
                            Return to office mode to edit real configuration.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
              {!refs && !error && <p>Loading office configuration…</p>}
            </>
          )}
          <p role="status" className="text-sm">
            {message}
          </p>
          {launchIds.length > 0 && (
            <section
              role="dialog"
              aria-label="Review batch launch"
              className="rounded-lg border-2 border-primary bg-card p-4 space-y-3"
            >
              <h2 className="font-semibold">Review launch</h2>
              <p>
                {
                  resolved.filter(
                    (t) => launchIds.includes(t.id) && needsCall(t),
                  ).length
                }{' '}
                tasks need calls.{' '}
                {
                  resolved.filter(
                    (t) => launchIds.includes(t.id) && !needsCall(t),
                  ).length
                }{' '}
                can finish from reviewed sources.
              </p>
              <p>
                Office concurrency {settings?.concurrency}; spending cap{' '}
                {settings?.spendingLimitCents} cents. Each task retains its
                displayed hold, total and retry limits.
              </p>
              <Button onClick={() => void start()}>Confirm Start</Button>
              <Button variant="ghost" onClick={() => setLaunchIds([])}>
                Back to review
              </Button>
            </section>
          )}
        </div>
      )}
      {blocker.state === 'blocked' && (
        <div
          role="alertdialog"
          aria-label="Leave temporary insurance session"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        >
          <div className="max-w-md space-y-4 rounded-lg bg-background p-6">
            <p>
              Leaving clears this temporary session. Print first. Active remote
              calls may take time to cancel.
            </p>
            <Button
              onClick={() => {
                clear();
                blocker.proceed();
              }}
            >
              Clear and leave
            </Button>
            <Button variant="outline" onClick={() => blocker.reset()}>
              Stay here
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
