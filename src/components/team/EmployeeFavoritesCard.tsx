import { FAVORITE_QUESTIONS } from '@/lib/work-style-questions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Gift } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';

const labels = Object.fromEntries(FAVORITE_QUESTIONS.map(question => [question.id, question.label]));

export default function EmployeeFavoritesCard({ favorites }: { favorites: Json | undefined }) {
  const entries = favorites && typeof favorites === 'object' && !Array.isArray(favorites)
    ? Object.entries(favorites).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && !!entry[1].trim()) : [];
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Gift className="h-5 w-5" />Favorite things</CardTitle></CardHeader>
      <CardContent>
        {entries.length ? <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {entries.map(([key, value]) => <div key={key}><dt className="text-sm text-muted-foreground">{labels[key] ?? key.replace(/_/g, ' ')}</dt><dd className="text-sm font-medium">{value}</dd></div>)}
        </dl> : <p className="text-sm text-muted-foreground">No favorites shared yet. Their answers will appear here when they share them during onboarding.</p>}
      </CardContent>
    </Card>
  );
}
