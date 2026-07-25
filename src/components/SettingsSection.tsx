import type { ReactNode } from 'react';
import { getSettingGroup } from '@/lib/settings-registry';

/**
 * Section wrapper for org settings, headed by the registry's group
 * title/description so every surface shows settings the way the guided
 * onboarding flow will walk through them.
 */
export default function SettingsSection({
  groupId,
  children,
}: {
  groupId: string;
  children: ReactNode;
}) {
  const group = getSettingGroup(groupId);
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-lg font-semibold">{group.title}</h2>
        <p className="text-sm text-muted-foreground">{group.description}</p>
      </div>
      {children}
    </section>
  );
}
