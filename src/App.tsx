import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import OfficeCalendar from "@/pages/OfficeCalendar";
import Timesheet from "@/pages/Timesheet";
import DaysOff from "@/pages/DaysOff";
import Reports from "@/pages/Reports";
import WorkZones from "@/pages/WorkZones";
import Settings from "@/pages/Settings";
import PTO from "@/pages/PTO";
import MyRequests from "@/pages/MyRequests";
import ApprovalQueue from "@/pages/ApprovalQueue";
import Team from "@/pages/Team";
import EmployeeDetail from "@/pages/EmployeeDetail";
import OrgSetup from "@/pages/OrgSetup";
import FofBuilder from "@/pages/FofBuilder";
import FofTemplates from "@/pages/FofTemplates";
import FofFees from "@/pages/FofFees";
import Assistant from "@/pages/Assistant";
import OfficeHandbook from "@/pages/OfficeHandbook";
import InsuranceDesk from "@/pages/InsuranceDesk";
import ImportantNumbers from "@/pages/ImportantNumbers";
import Checklists from "@/pages/Checklists";
import DepositLog from "@/pages/DepositLog";
import IncidentReports from "@/pages/IncidentReports";
import MorningHuddle from "@/pages/MorningHuddle";
import Goals from "@/pages/Goals";
import ReminderSettings from "@/pages/ReminderSettings";
import InboxPage from "@/pages/InboxPage";
import Training from "@/pages/Training";
import Workplace from "@/pages/Workplace";
import Playbook from "@/pages/Playbook";
import Management from "@/pages/Management";
import Help from "@/pages/Help";
import Privacy from "@/pages/Privacy";
import AcceptInvite from "@/pages/AcceptInvite";
import Onboarding from "@/pages/Onboarding";
import NotFound from "@/pages/NotFound";
import OAuthConsent from "@/pages/OAuthConsent";
import { Loader2 } from "lucide-react";
import { useOnboardingStatus } from "@/hooks/useOnboarding";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isAllowed } = useAuth();
  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
  if (!user || !isAllowed) return <Navigate to="/auth" replace />;
  return <OnboardingGate>{children}</OnboardingGate>;
}

/**
 * Members with unfinished onboarding land on /onboarding until it's done.
 * Fails open: if the check can't run, the app opens normally.
 */
function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { data: status, isReady, hasOrg } = useOnboardingStatus();
  if (isReady && hasOrg && status && !status.complete) {
    return <Navigate to="/onboarding" replace />;
  }
  return <AppLayout>{children}</AppLayout>;
}

/** The flow itself renders outside the app shell — no nav until it's finished. */
function OnboardingRoute() {
  const { user, loading, isAllowed } = useAuth();
  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
  if (!user || !isAllowed) return <Navigate to="/auth" replace />;
  return <Onboarding />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/workplace" element={<ProtectedRoute><Workplace /></ProtectedRoute>} />
            <Route path="/playbook" element={<ProtectedRoute><Playbook /></ProtectedRoute>} />
            <Route path="/management" element={<ProtectedRoute><Management /></ProtectedRoute>} />
            <Route path="/inbox" element={<Navigate to="/inbox/messages" replace />} />
            <Route path="/inbox/:tab" element={<ProtectedRoute><InboxPage /></ProtectedRoute>} />
            <Route path="/help" element={<ProtectedRoute><Help /></ProtectedRoute>} />
            <Route path="/timesheet" element={<ProtectedRoute><Timesheet /></ProtectedRoute>} />
            <Route path="/days-off" element={<ProtectedRoute><DaysOff /></ProtectedRoute>} />
            <Route path="/office-calendar" element={<ProtectedRoute><OfficeCalendar /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/work-zones" element={<ProtectedRoute><WorkZones /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/pto" element={<ProtectedRoute><PTO /></ProtectedRoute>} />
            <Route path="/my-requests" element={<ProtectedRoute><MyRequests /></ProtectedRoute>} />
            <Route path="/approvals" element={<ProtectedRoute><ApprovalQueue /></ProtectedRoute>} />
            <Route path="/team" element={<ProtectedRoute><Team /></ProtectedRoute>} />
            <Route path="/team/:employeeId" element={<ProtectedRoute><EmployeeDetail /></ProtectedRoute>} />
            <Route path="/org-setup" element={<ProtectedRoute><OrgSetup /></ProtectedRoute>} />
            <Route path="/fof" element={<ProtectedRoute><FofBuilder /></ProtectedRoute>} />
            <Route path="/fof/templates" element={<ProtectedRoute><FofTemplates /></ProtectedRoute>} />
            <Route path="/fof/fees" element={<ProtectedRoute><FofFees /></ProtectedRoute>} />
            <Route path="/assistant" element={<ProtectedRoute><Assistant /></ProtectedRoute>} />
            <Route path="/handbook" element={<ProtectedRoute><OfficeHandbook /></ProtectedRoute>} />
            <Route path="/insurance-desk" element={<ProtectedRoute><InsuranceDesk /></ProtectedRoute>} />
            {/* Old bookmark-safe path for the rebuilt handbook. */}
            <Route path="/policy-manual" element={<Navigate to="/handbook" replace />} />
            <Route path="/important-numbers" element={<ProtectedRoute><ImportantNumbers /></ProtectedRoute>} />
            <Route path="/checklists" element={<ProtectedRoute><Checklists /></ProtectedRoute>} />
            <Route path="/deposit-log" element={<ProtectedRoute><DepositLog /></ProtectedRoute>} />
            <Route path="/incident-reports" element={<ProtectedRoute><IncidentReports /></ProtectedRoute>} />
            <Route path="/morning-huddle" element={<ProtectedRoute><MorningHuddle /></ProtectedRoute>} />
            <Route path="/goals" element={<ProtectedRoute><Goals /></ProtectedRoute>} />
            <Route path="/settings/reminders" element={<ProtectedRoute><ReminderSettings /></ProtectedRoute>} />
            <Route path="/training" element={<ProtectedRoute><Training /></ProtectedRoute>} />
            <Route path="/requests" element={<Navigate to="/inbox/requests" replace />} />
            <Route path="/messages" element={<Navigate to="/inbox/messages" replace />} />
            <Route path="/nudges" element={<Navigate to="/inbox/nudges" replace />} />
            <Route path="/onboarding" element={<OnboardingRoute />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            <Route path="*" element={<Navigate to="/auth" replace />} />

          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
