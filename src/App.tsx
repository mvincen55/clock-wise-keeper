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
import PolicyManual from "@/pages/PolicyManual";
import ImportantNumbers from "@/pages/ImportantNumbers";
import Checklists from "@/pages/Checklists";
import DepositLog from "@/pages/DepositLog";
import AcceptInvite from "@/pages/AcceptInvite";
import NotFound from "@/pages/NotFound";
import OAuthConsent from "@/pages/OAuthConsent";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isAllowed } = useAuth();
  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
  if (!user || !isAllowed) return <Navigate to="/auth" replace />;
  return <AppLayout>{children}</AppLayout>;
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
            <Route path="/policy-manual" element={<ProtectedRoute><PolicyManual /></ProtectedRoute>} />
            <Route path="/important-numbers" element={<ProtectedRoute><ImportantNumbers /></ProtectedRoute>} />
            <Route path="/checklists" element={<ProtectedRoute><Checklists /></ProtectedRoute>} />
            <Route path="/deposit-log" element={<ProtectedRoute><DepositLog /></ProtectedRoute>} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            <Route path="*" element={<Navigate to="/auth" replace />} />

          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
