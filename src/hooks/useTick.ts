import { useEffect, useState } from 'react';

/** A clock that re-renders on an interval, so countdowns actually count down. */
export function useTick(ms = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}
