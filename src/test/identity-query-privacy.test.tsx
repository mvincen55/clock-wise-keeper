import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { IdentityQueryProvider } from '@/components/IdentityQueryProvider';

const deferred = () => { let resolve!: (v: string) => void; let reject!: (e: Error) => void; const promise = new Promise<string>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

describe('private caches are retired with their identity', () => {
  it.each(['same-office', 'other-office'])('never displays the previous staff data during a %s switch', async office => {
    const pending = deferred();
    const late = deferred();
    const clients: QueryClient[] = [];
    let aborted = false;
    function Private({ who }: { who: string }) {
      const client = useQueryClient(); if (!clients.includes(client)) clients.push(client);
      // Deliberately identical permission-dependent key, as in legacy payroll caches.
      const org = who === 'a' || office === 'same-office' ? 'office-a' : 'office-b';
      const query = useQuery({ queryKey: ['private', org], retry: false, queryFn: () => who === 'a' ? Promise.resolve('A private result') : pending.promise });
      useQuery({ queryKey: ['delayed'], retry: false, queryFn: ({ signal }) => { if (who === 'a') { signal.addEventListener('abort', () => { aborted = true; }); return late.promise; } return Promise.resolve('B result'); } });
      return <div>{query.data ?? 'pending'}</div>;
    }
    const view = (who: string) => <IdentityQueryProvider identity={who}><Private who={who} /></IdentityQueryProvider>;
    const { rerender } = render(view('a'));
    await screen.findByText('A private result');
    rerender(view('b'));
    expect(screen.queryByText('A private result')).toBeNull();
    expect(clients[0].getQueryCache().getAll()).toEqual([]);
    expect(aborted).toBe(true);
    await act(async () => { late.resolve('old delayed response'); pending.reject(new Error('new request failed')); });
    await waitFor(() => expect(clients[1].getQueryState(['private', office === 'same-office' ? 'office-a' : 'office-b'])?.status).toBe('error'));
    expect(screen.queryByText('A private result')).toBeNull();
    expect(clients[0].getQueryCache().getAll()).toEqual([]);
  });
  it('same-user refresh retains the cache and complete unsaved input; logout destroys both', async () => {
    const fetcher = vi.fn(async () => 'private');
    function Form() {
      const [value, setValue] = useState('');
      useQuery({ queryKey: ['private'], queryFn: fetcher, staleTime: Infinity });
      return <input aria-label="unsaved" value={value} onChange={e => setValue(e.target.value)} />;
    }
    const view = (identity: string | null) => <IdentityQueryProvider identity={identity}><Form /></IdentityQueryProvider>;
    const { rerender } = render(view('a'));
    fireEvent.change(screen.getByLabelText('unsaved'), { target: { value: 'synthetic form' } });
    rerender(view('a'));
    expect(screen.getByLabelText('unsaved')).toHaveValue('synthetic form');
    expect(fetcher).toHaveBeenCalledTimes(1);
    rerender(view(null));
    expect(screen.getByLabelText('unsaved')).toHaveValue('');
  });
});
