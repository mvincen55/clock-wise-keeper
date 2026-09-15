import { createContext, useContext, type ReactNode } from 'react';
import { useBrokenApptSettings } from '@/hooks/useBrokenApptSettings';
import { useOfficeFeeLookup } from '@/hooks/useOfficeFeeLookup';
import type { LiveValues } from '@/lib/handbook-live-fields';

const HandbookLiveContext = createContext<LiveValues>({});

/**
 * Supplies the office's current fees and Broken Appointments settings to
 * every live field rendered beneath it. Readers that show office documents
 * wrap their content in this; anything rendered outside it shows fallbacks.
 */
export function HandbookLiveProvider({ children }: { children: ReactNode }) {
  const { data: fees } = useOfficeFeeLookup();
  const { data: settings } = useBrokenApptSettings();
  return (
    <HandbookLiveContext.Provider value={{ fees: fees?.byCode ?? null, settings: settings ?? null }}>
      {children}
    </HandbookLiveContext.Provider>
  );
}

export const useHandbookLiveValues = () => useContext(HandbookLiveContext);
