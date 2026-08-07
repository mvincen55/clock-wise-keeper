import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, createRoutesFromElements, RouterProvider, Route, Navigate, useLocation } from "react-router-dom";
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
import BrokenAppointments from "@/pages/BrokenAppointments";
import FofTemplates from "@/pages/FofTemplates";
import FofFees from "@/pages/FofFees";
import ConsentsHub from "@/pages/ConsentsHub";
import ConsentLibrary from "@/pages/ConsentLibrary";
import ConsentBuilder from "@/pages/ConsentBuilder";
import ConsentBundles from "@/pages/ConsentBundles";
import CompleteForms from "@/pages/CompleteForms";
import ConsentSettings from "@/pages/ConsentSettings";
import LettersHub from "@/pages/LettersHub";
import WriteLetter from "@/pages/WriteLetter";
import SchoolWorkNote from "@/pages/SchoolWorkNote";
import SavedLetters from "@/pages/SavedLetters";
import MySignaturePage from "@/pages/MySignaturePage";
import CorrespondenceSettingsPage from "@/pages/CorrespondenceSettingsPage";
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
import PracticeProcedures from "@/pages/PracticeProcedures";
import Management from "@/pages/Management";
import KnowledgeWorkspace from "@/pages/KnowledgeWorkspace";
import KnowledgeAcknowledgments from "@/pages/KnowledgeAcknowledgments";
import PracticeSetup from "@/pages/PracticeSetup";
import Help from "@/pages/Help";
import Privacy from "@/pages/Privacy";
import AcceptInvite from "@/pages/AcceptInvite";
import ResetPassword from "@/pages/ResetPassword";
import Onboarding from "@/pages/Onboarding";
import OAuthConsent from "@/pages/OAuthConsent";
import { Loader2 } from "lucide-react";
import { useOnboardingStatus } from "@/hooks/useOnboarding";
import MarketingHome from "@/pages/marketing/Home";
import MarketingFeatures from "@/pages/marketing/Features";
import MarketingForDental from "@/pages/marketing/ForDental";
import MarketingSecurity from "@/pages/marketing/Security";
import MarketingPricing from "@/pages/marketing/Pricing";
import MarketingAbout from "@/pages/marketing/About";
import MarketingStart from "@/pages/marketing/Start";
// TEMPORARY: preview-only design review index (see src/pages/DesignReview.tsx)
import DesignReview from "@/pages/DesignReview";

const queryClient = new QueryClient();

function LoginRedirect() {
  const location = useLocation();
  const next = `${location.pathname}${location.search}`;
  return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isAllowed } = useAuth();
  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
  if (!user || !isAllowed) return <LoginRedirect />;
  return <OnboardingGate>{children}</OnboardingGate>;
}

/**
 * `/` is the public Purple Envelope website when signed out, and the existing
 * office dashboard when signed in. Nothing about the authenticated experience
 * changes — this is only the logged-out/public split.
 */
function RootRoute() {
  const { user, loading, isAllowed } = useAuth();
  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
  if (!user || !isAllowed) return <MarketingHome />;
  return <OnboardingGate><Dashboard /></OnboardingGate>;
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
  if (!user || !isAllowed) return <LoginRedirect />;
  return <Onboarding />;
}

// A data router (instead of <BrowserRouter>) so in-app navigation can be
// blocked with useBlocker — the Complete Forms packet and builder drafts warn
// before a navigation would erase unfinished in-memory work.
const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/auth" element={<Auth />} />
            <Route path="/login" element={<Auth />} />
            {/* Public marketing site — visible only when signed out at "/". */}
            <Route path="/" element={<RootRoute />} />
            <Route path="/features" element={<MarketingFeatures />} />
            <Route path="/for-dental" element={<MarketingForDental />} />
            <Route path="/security" element={<MarketingSecurity />} />
            <Route path="/pricing" element={<MarketingPricing />} />
            <Route path="/about" element={<MarketingAbout />} />
            <Route path="/start" element={<MarketingStart />} />
            {/* TEMPORARY preview-only review index — remove with DesignReview.tsx */}
            <Route path="/design-review" element={<DesignReview />} />
            <Route path="/workplace" element={<ProtectedRoute><Workplace /></ProtectedRoute>} />
            <Route path="/playbook" element={<ProtectedRoute><Playbook /></ProtectedRoute>} />
            <Route path="/playbook/procedures" element={<ProtectedRoute><PracticeProcedures /></ProtectedRoute>} />
            <Route path="/management" element={<ProtectedRoute><Management /></ProtectedRoute>} />
            <Route path="/management/knowledge" element={<ProtectedRoute><KnowledgeWorkspace /></ProtectedRoute>} />
            <Route path="/practice-setup" element={<ProtectedRoute><PracticeSetup /></ProtectedRoute>} />
            <Route path="/acknowledgments" element={<ProtectedRoute><KnowledgeAcknowledgments /></ProtectedRoute>} />
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
            <Route path="/broken-appointments" element={<ProtectedRoute><BrokenAppointments /></ProtectedRoute>} />
            <Route path="/fof" element={<ProtectedRoute><FofBuilder /></ProtectedRoute>} />
            <Route path="/fof/templates" element={<ProtectedRoute><FofTemplates /></ProtectedRoute>} />
            <Route path="/fof/fees" element={<ProtectedRoute><FofFees /></ProtectedRoute>} />
            <Route path="/consents" element={<ProtectedRoute><ConsentsHub /></ProtectedRoute>} />
            <Route path="/consents/library" element={<ProtectedRoute><ConsentLibrary /></ProtectedRoute>} />
            <Route path="/consents/builder" element={<ProtectedRoute><ConsentBuilder /></ProtectedRoute>} />
            <Route path="/consents/builder/:formId" element={<ProtectedRoute><ConsentBuilder /></ProtectedRoute>} />
            <Route path="/consents/bundles" element={<ProtectedRoute><ConsentBundles /></ProtectedRoute>} />
            <Route path="/consents/complete" element={<ProtectedRoute><CompleteForms /></ProtectedRoute>} />
            <Route path="/consents/settings" element={<ProtectedRoute><ConsentSettings /></ProtectedRoute>} />
            <Route path="/letters" element={<ProtectedRoute><LettersHub /></ProtectedRoute>} />
            <Route path="/letters/write" element={<ProtectedRoute><WriteLetter /></ProtectedRoute>} />
            <Route path="/letters/school-work-note" element={<ProtectedRoute><SchoolWorkNote /></ProtectedRoute>} />
            <Route path="/letters/library" element={<ProtectedRoute><SavedLetters /></ProtectedRoute>} />
            <Route path="/letters/signature" element={<ProtectedRoute><MySignaturePage /></ProtectedRoute>} />
            <Route path="/letters/settings" element={<ProtectedRoute><CorrespondenceSettingsPage /></ProtectedRoute>} />
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
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            <Route path="*" element={<Navigate to="/" replace />} />
    </>
  )
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <RouterProvider router={router} />
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
