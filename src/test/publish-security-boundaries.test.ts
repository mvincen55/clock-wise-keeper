import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readRepoFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('production publish security boundaries', () => {
  it('does not expose repository write tools through the tenant office assistant', () => {
    const source = readRepoFile('supabase/functions/kimi-agent/index.ts');

    expect(source).toContain('const githubReady = false;');
    expect(source).not.toContain('name: "github_commit_files"');
    expect(source).not.toContain('name: "github_open_pr"');
    expect(source).toContain('Source-code tools are disabled inside tenant office assistants.');
  });

  it('guards attendance recomputation before invoking the private calculation body', () => {
    const migration = readRepoFile('supabase/migrations/20260804122000_publish_security_hardening.sql');

    expect(migration).toContain('RENAME TO _recompute_attendance_range_internal');
    expect(migration).toContain("v_jwt_role = 'service_role'");
    expect(migration).toContain('p_user_id = v_caller');
    expect(migration).toContain('public.is_org_admin(v_org_id)');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public._recompute_attendance_range_internal');
  });
});
