import type { OfficeSettings } from '../domain/schema';
import type { Task, TaskEvent } from '../domain/workflow';

export type SessionOwner = { userId: string; orgId: string };
export type SessionCapability = SessionOwner & {
  id: string;
  secret: string;
  expiresAt: number;
};
export type Readiness = {
  ready: boolean;
  mode: 'synthetic' | 'live';
  requirements: string[];
};
export type LaunchResult =
  | { state: 'created'; callRef: string }
  | { state: 'not_created' }
  | { state: 'ambiguous' };
/** Server-only transport. Never instantiate a vendor client with browser secrets. */
export interface CallAdapter {
  readonly mode: 'synthetic' | 'live';
  start(task: Task, attemptId: string): Promise<LaunchResult>;
  status(callRef: string): Promise<'active' | 'ended' | 'unknown'>;
  cancel(callRef: string): Promise<void>;
  reconcile(attemptId: string): Promise<LaunchResult>;
  releaseSession?(sessionId: string): void;
}
export interface SessionTransport {
  readiness(): Promise<Readiness>;
  open(): Promise<SessionCapability>;
  start(
    session: SessionCapability,
    tasks: Task[],
    settingsVersion: number,
  ): Promise<void>;
  events(
    session: SessionCapability,
    after: number,
    signal: AbortSignal,
    receive: (event: TaskEvent) => void,
  ): Promise<void>;
  control(
    session: SessionCapability,
    action: 'pause' | 'resume' | 'clear' | 'cancel' | 'retry',
    taskId?: string,
  ): Promise<void>;
}
export type AuthorizedOffice = SessionOwner & {
  settings: OfficeSettings;
  approved: boolean;
};
