import { useLayoutEffect, useMemo, type ReactNode } from 'react';
import { hashKey, QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** Every cache (including payroll, employee details and mutation results) belongs
 * to one authenticated identity. Late responses can only reach the retired client.
 * Token changes deliberately do not replace the client or unmount memory-only forms. */
export function IdentityQueryProvider({ identity, children }: { identity: string | null; children: ReactNode }) {
  const client = useMemo(() => new QueryClient({
    defaultOptions: { queries: { queryKeyHashFn: key => hashKey([identity, ...key]) } },
  }), [identity]);
  useLayoutEffect(() => () => {
    void client.cancelQueries();
    client.clear();
  }, [client]);
  return <QueryClientProvider key={identity ?? 'signed-out'} client={client}>{children}</QueryClientProvider>;
}
