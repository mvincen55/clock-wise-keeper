import { useState } from 'react';
import { useWorkZones, useCreateZone, useUpdateZone, useDeleteZone, WorkZone } from '@/hooks/useWorkZones';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Plus, Trash2, Loader2, Save } from 'lucide-react';

function ZoneForm({ zone, onSave, onCancel }: {
  zone?: WorkZone;
  onSave: (data: any) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(zone?.zone_name || '');
  const [lat, setLat] = useState(zone?.latitude?.toString() || '');
  const [lng, setLng] = useState(zone?.longitude?.toString() || '');
  const [radius, setRadius] = useState(zone?.radius_meters?.toString() || '150');
  const [enterDelay, setEnterDelay] = useState(zone?.enter_delay_minutes?.toString() || '2');
  const [exitDelay, setExitDelay] = useState(zone?.exit_delay_minutes?.toString() || '5');

  const handleUseCurrentLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
      },
      () => alert('Could not get current location'),
      { enableHighAccuracy: true }
    );
  };

  return (
    <Card className="card-elevated">
      <CardContent className="p-4 space-y-4">
        <div className="space-y-1">
          <Label>Zone Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Main Office" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Latitude</Label>
            <Input value={lat} onChange={e => setLat(e.target.value)} placeholder="40.7128" />
          </div>
          <div className="space-y-1">
            <Label>Longitude</Label>
            <Input value={lng} onChange={e => setLng(e.target.value)} placeholder="-74.0060" />
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleUseCurrentLocation} type="button">
          <MapPin className="mr-2 h-4 w-4" />
          Use Current Location
        </Button>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Radius (m)</Label>
            <Input type="number" value={radius} onChange={e => setRadius(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Enter Delay (min)</Label>
            <Input type="number" value={enterDelay} onChange={e => setEnterDelay(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Exit Delay (min)</Label>
            <Input type="number" value={exitDelay} onChange={e => setExitDelay(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => onSave({
              zone_name: name,
              latitude: parseFloat(lat),
              longitude: parseFloat(lng),
              radius_meters: parseInt(radius),
              enter_delay_minutes: parseInt(enterDelay),
              exit_delay_minutes: parseInt(exitDelay),
            })}
            disabled={!name || !lat || !lng}
          >
            <Save className="mr-2 h-4 w-4" />
            {zone ? 'Update' : 'Create'} Zone
          </Button>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function WorkZones() {
  const { data: zones, isLoading } = useWorkZones();
  const createZone = useCreateZone();
  const updateZone = useUpdateZone();
  const deleteZone = useDeleteZone();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingZone, setEditingZone] = useState<WorkZone | null>(null);

  const handleCreate = async (data: any) => {
    try {
      await createZone.mutateAsync(data);
      setShowForm(false);
      toast({ title: 'Zone created' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleUpdate = async (data: any) => {
    if (!editingZone) return;
    try {
      await updateZone.mutateAsync({ id: editingZone.id, ...data });
      setEditingZone(null);
      toast({ title: 'Zone updated' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleToggle = async (zone: WorkZone) => {
    await updateZone.mutateAsync({ id: zone.id, is_active: !zone.is_active });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this zone?')) return;
    try {
      await deleteZone.mutateAsync(id);
      toast({ title: 'Zone deleted' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Work Zones</h1>
          <p className="text-muted-foreground">Configure GPS-based auto clock locations</p>
        </div>
        {!showForm && !editingZone && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Zone
          </Button>
        )}
      </div>

      {showForm && (
        <ZoneForm onSave={handleCreate} onCancel={() => setShowForm(false)} />
      )}

      {editingZone && (
        <ZoneForm zone={editingZone} onSave={handleUpdate} onCancel={() => setEditingZone(null)} />
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !zones?.length ? (
        <Card className="card-elevated">
          <CardContent className="p-8 text-center text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No work zones configured yet</p>
            <p className="text-sm mt-1">Add a zone to enable GPS-based auto clocking</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {zones.map(zone => (
            <Card key={zone.id} className={`card-elevated ${!zone.is_active ? 'opacity-60' : ''}`}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-medium truncate">{zone.zone_name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {zone.latitude.toFixed(4)}, {zone.longitude.toFixed(4)} · {zone.radius_meters}m radius
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Enter: {zone.enter_delay_minutes}min · Exit: {zone.exit_delay_minutes}min
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={zone.is_active} onCheckedChange={() => handleToggle(zone)} />
                  <Button variant="ghost" size="icon" onClick={() => setEditingZone(zone)}>
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(zone.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
