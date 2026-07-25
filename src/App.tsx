import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Auth from "@/pages/Auth";
import OrgSetup from "@/pages/OrgSetup";
import FofBuilder from "@/pages/FofBuilder";
import FofTemplates from "@/pages/FofTemplates";
import FofFees from "@/pages/FofFees";
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
            <Route path="/" element={<Navigate to="/fof" replace />} />
            <Route path="/org-setup" element={<ProtectedRoute><OrgSetup /></ProtectedRoute>} />
            <Route path="/fof" element={<ProtectedRoute><FofBuilder /></ProtectedRoute>} />
            <Route path="/fof/templates" element={<ProtectedRoute><FofTemplates /></ProtectedRoute>} />
            <Route path="/fof/fees" element={<ProtectedRoute><FofFees /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/auth" replace />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
