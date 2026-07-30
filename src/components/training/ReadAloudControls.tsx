import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Headphones, Pause, Play, RotateCcw, Settings2, Square } from 'lucide-react';
import { DEFAULT_PREFS, type useSpeech } from '@/hooks/useSpeech';

type Props = { speech: ReturnType<typeof useSpeech> };

/** Listen / pause / stop plus voice, speed and pitch tuning for read-aloud. */
export default function ReadAloudControls({ speech }: Props) {
  const { supported, voices, prefs, updatePrefs, speaking, paused, play, pause, resume, stop, restartWithCurrentSettings } =
    speech;

  if (!supported) return null;

  function change(patch: Parameters<typeof updatePrefs>[0]) {
    updatePrefs(patch);
    // Give state a tick to settle before restarting the queue.
    setTimeout(() => restartWithCurrentSettings(), 0);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!speaking ? (
        <Button variant="outline" size="sm" onClick={play}>
          <Headphones className="mr-1.5 h-4 w-4" />
          Listen
        </Button>
      ) : (
        <>
          <Button variant="outline" size="sm" onClick={paused ? resume : pause}>
            {paused ? <Play className="mr-1.5 h-4 w-4" /> : <Pause className="mr-1.5 h-4 w-4" />}
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button variant="ghost" size="sm" onClick={stop}>
            <Square className="mr-1.5 h-4 w-4" />
            Stop
          </Button>
        </>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" aria-label="Read-aloud settings">
            <Settings2 className="mr-1.5 h-4 w-4" />
            Voice
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Voice</Label>
            <Select
              value={prefs.voiceURI ?? 'default'}
              onValueChange={value => change({ voiceURI: value === 'default' ? null : value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="System default" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="default">System default</SelectItem>
                {voices.map(voice => (
                  <SelectItem key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} ({voice.lang})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Speed</Label>
              <span className="text-xs text-muted-foreground">{prefs.rate.toFixed(1)}x</span>
            </div>
            <Slider
              min={0.5}
              max={2}
              step={0.1}
              value={[prefs.rate]}
              onValueChange={([rate]) => updatePrefs({ rate })}
              onValueCommit={() => restartWithCurrentSettings()}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Pitch</Label>
              <span className="text-xs text-muted-foreground">{prefs.pitch.toFixed(1)}</span>
            </div>
            <Slider
              min={0.5}
              max={2}
              step={0.1}
              value={[prefs.pitch]}
              onValueChange={([pitch]) => updatePrefs({ pitch })}
              onValueCommit={() => restartWithCurrentSettings()}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-xs">Remember my choice</Label>
              <p className="text-[11px] text-muted-foreground">Saved on this device only.</p>
            </div>
            <Switch
              checked={prefs.remember}
              onCheckedChange={remember => updatePrefs({ remember })}
            />
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => change({ ...DEFAULT_PREFS, remember: prefs.remember })}
          >
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Reset to default
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
