import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
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
import NotFound from "@/pages/NotFound";
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
            <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/work-zones" element={<ProtectedRoute><WorkZones /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/pto" element={<ProtectedRoute><PTO /></ProtectedRoute>} />
            <Route path="/my-requests" element={<ProtectedRoute><MyRequests /></ProtectedRoute>} />
            <Route path="/approvals" element={<ProtectedRoute><ApprovalQueue /></ProtectedRoute>} />
            <Route path="/team" element={<ProtectedRoute><Team /></ProtectedRoute>} />
            <Route path="/team/:employeeId" element={<ProtectedRoute><EmployeeDetail /></ProtectedRoute>} />
            <Route path="/org-setup" element={<ProtectedRoute><OrgSetup /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/auth" replace />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
