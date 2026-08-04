import { Link } from 'react-router-dom';
import { BookOpenCheck, LibraryBig } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import PublishedKnowledgeReader from '@/components/knowledge/PublishedKnowledgeReader';
import { useOrgContext } from '@/hooks/useOrgContext';

function ProceduresEmptyState() {
  const { data: ctx } = useOrgContext();
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <LibraryBig className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold md:text-3xl">Office Procedures</h1>
        </div>
        <p className="mt-1 text-muted-foreground">The repeatable steps for how this dental office performs excellent work.</p>
      </div>
      <Card>
        <CardContent className="py-16 text-center">
          <BookOpenCheck className="mx-auto h-11 w-11 text-muted-foreground/45" />
          <h2 className="mt-4 text-lg font-semibold">No procedures have been published yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Draft and review office procedures before the team sees them. Insurance carrier manuals remain in the Insurance Desk, and live tools remain on the Practice Playbook home.
          </p>
          {isAdmin && (
            <Button asChild className="mt-5">
              <Link to="/management/knowledge">Open Knowledge Workspace</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PracticeProcedures() {
  return (
    <PublishedKnowledgeReader
      area="playbook"
      title="Office Procedures"
      subtitle="The repeatable steps for how this dental office performs excellent work."
      fallback={<ProceduresEmptyState />}
    />
  );
}
