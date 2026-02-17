import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { getToday } from '@/lib/time-utils';

export type GeoStatus = 'active' | 'permission_missing' | 'inactive' | 'unavailable';

export type LocationState = {
  status: GeoStatus;
  lastLat: number | null;
  lastLng: number | null;
  lastAccuracy: number | null;
  lastTimestamp: string | null;
  lastZone: string | null;
  lastAction: string | null;
  error: string | null;
};

const POLL_INTERVAL = 30000; // 30 seconds

export function useGeoTracking(enabled: boolean) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const intervalRef = useRef<number | null>(null);
  const [state, setState] = useState<LocationState>({
    status: 'inactive',
    lastLat: null,
    lastLng: null,
    lastAccuracy: null,
    lastTimestamp: null,
    lastZone: null,
    lastAction: null,
    error: null,
  });

  const sendLocation = useCallback(async (position: GeolocationPosition) => {
    if (!user) return;

    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const accuracy = position.coords.accuracy;
    const timestamp = new Date().toISOString();

    setState(s => ({
      ...s,
      lastLat: lat,
      lastLng: lng,
      lastAccuracy: accuracy,
      lastTimestamp: timestamp,
      status: 'active',
      error: null,
    }));

    try {
      const { data, error } = await supabase.functions.invoke('process-location-event', {
        body: { lat, lng, accuracy, timestamp },
      });

      if (error) throw error;

      setState(s => ({
        ...s,
        lastZone: data?.zone || null,
        lastAction: data?.action_taken || null,
      }));

      if (data?.action_taken && data.action_taken !== 'none') {
        qc.invalidateQueries({ queryKey: ['time-entry', getToday()] });
        qc.invalidateQueries({ queryKey: ['time-entries'] });
      }
    } catch (err: any) {
      console.error('Location event error:', err);
      setState(s => ({ ...s, error: err.message }));
    }
  }, [user, qc]);

  const handleError = useCallback((err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) {
      setState(s => ({ ...s, status: 'permission_missing', error: 'Location permission denied' }));
    } else {
      setState(s => ({ ...s, status: 'unavailable', error: err.message }));
    }
  }, []);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setState(s => ({ ...s, status: 'unavailable', error: 'Geolocation not supported' }));
      return;
    }

    // Initial position
    navigator.geolocation.getCurrentPosition(sendLocation, handleError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 5000,
    });

    // Polling
    intervalRef.current = window.setInterval(() => {
      navigator.geolocation.getCurrentPosition(sendLocation, handleError, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      });
    }, POLL_INTERVAL);
  }, [sendLocation, handleError]);

  const stopTracking = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setState(s => ({ ...s, status: 'inactive' }));
  }, []);

  useEffect(() => {
    if (enabled && user) {
      startTracking();
    } else {
      stopTracking();
    }
    return () => stopTracking();
  }, [enabled, user, startTracking, stopTracking]);

  return state;
}
