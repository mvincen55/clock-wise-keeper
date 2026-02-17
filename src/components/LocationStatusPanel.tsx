import { LocationState, GeoStatus } from '@/hooks/useGeoTracking';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, Wifi, WifiOff, AlertTriangle } from 'lucide-react';

const statusConfig: Record<GeoStatus, { label: string; color: string; icon: typeof MapPin }> = {
  active: { label: 'Tracking', color: 'text-success', icon: MapPin },
  permission_missing: { label: 'Permission Missing', color: 'text-warning', icon: AlertTriangle },
  inactive: { label: 'Inactive', color: 'text-muted-foreground', icon: WifiOff },
  unavailable: { label: 'Unavailable', color: 'text-destructive', icon: WifiOff },
};

export function LocationStatusPanel({ state }: { state: LocationState }) {
  const cfg = statusConfig[state.status];
  const Icon = cfg.icon;

  return (
    <Card className="card-elevated">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Wifi className="h-4 w-4 text-primary" />
          Location Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${
            state.status === 'active' ? 'bg-success animate-pulse' :
            state.status === 'permission_missing' ? 'bg-warning' : 'bg-muted-foreground'
          }`} />
          <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
        </div>

        {state.lastTimestamp && (
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Last update: {new Date(state.lastTimestamp).toLocaleTimeString()}</p>
            {state.lastAccuracy != null && (
              <p>GPS accuracy: {Math.round(state.lastAccuracy)}m {state.lastAccuracy > 100 && <span className="text-warning">(low)</span>}</p>
            )}
            {state.lastZone && <p>Zone: {state.lastZone}</p>}
            {state.lastAction && state.lastAction !== 'none' && (
              <p className="text-primary font-medium">Last action: {state.lastAction.replace('_', ' ')}</p>
            )}
          </div>
        )}

        {state.error && (
          <div className="text-xs text-destructive flex items-start gap-1">
            <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
            {state.error}
          </div>
        )}

        {state.status === 'permission_missing' && (
          <p className="text-xs text-warning">
            Enable location access in your browser settings to use auto clocking.
          </p>
        )}

        {state.status === 'unavailable' && (
          <p className="text-xs text-muted-foreground">
            GPS is not available. Manual clocking is still enabled.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
