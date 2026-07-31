import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Messages from '@/pages/Messages';
import Requests from '@/pages/Requests';
import OfficeNudgesPage from '@/pages/OfficeNudges';
import { useOpenNudgeCount } from '@/hooks/useOfficeNudges';

const TABS = ['messages', 'requests', 'nudges'] as const;
type InboxTab = (typeof TABS)[number];

/**
 * Unified Inbox (blueprint §4): Messages, Doctor Requests, and Nudges as
 * coordinated workflows behind one destination. Each tab keeps its existing
 * behavior; the legacy routes redirect here.
 */
export default function InboxPage() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const openNudges = useOpenNudgeCount();

  if (!tab || !TABS.includes(tab as InboxTab)) {
    return <Navigate to="/inbox/messages" replace />;
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Inbox</h1>
        <p className="text-muted-foreground">Messages, doctor requests, and nudges — one place.</p>
      </div>

      <Tabs value={tab} onValueChange={v => navigate(`/inbox/${v}`)}>
        <TabsList>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="requests">Doctor Requests</TabsTrigger>
          <TabsTrigger value="nudges">
            Nudges{openNudges > 0 && ` (${openNudges})`}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'messages' && <Messages />}
      {tab === 'requests' && <Requests />}
      {tab === 'nudges' && <OfficeNudgesPage />}
    </div>
  );
}
