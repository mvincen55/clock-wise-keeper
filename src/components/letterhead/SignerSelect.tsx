import { PenLine } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useSignerOptions, type SignerOption } from '@/hooks/useSignerOptions';

/**
 * Signer picker for letters and notes — the signed-in user, the provider
 * registry, and the office-level signer. Options with authorized stored ink
 * are marked; everyone else signs the printed page by hand above their
 * typed name. Authorization is the owner's own allow_office_use flag,
 * enforced server-side too (useSignerOptions).
 */

export default function SignerSelect({
  value,
  onChange,
  title,
  onTitleChange,
}: {
  value: string;
  onChange: (key: string, option: SignerOption | undefined) => void;
  title: string;
  onTitleChange: (title: string) => void;
}) {
  const { options } = useSignerOptions();

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="letter-signer">Signed by</Label>
        <Select
          value={value}
          onValueChange={key => onChange(key, options.find(o => o.key === key))}
        >
          <SelectTrigger id="letter-signer" aria-label="Signed by">
            <SelectValue placeholder="Choose a signer" />
          </SelectTrigger>
          <SelectContent>
            {options.map(option => (
              <SelectItem key={option.key} value={option.key}>
                <span className="flex items-center gap-1.5">
                  {option.label}
                  {option.signatureUserId && (
                    <PenLine className="h-3 w-3 text-primary" aria-label="Stored signature available" />
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="letter-signer-title">Title (optional)</Label>
        <Input
          id="letter-signer-title"
          value={title}
          onChange={e => onTitleChange(e.target.value)}
          placeholder="e.g. Office Manager"
        />
      </div>
    </div>
  );
}
