import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ChatApp } from "./components/ChatApp";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import { SessionContextProvider } from "./components/SessionContextProvider";
import { CallProvider } from "./components/CallProvider"; // Import CallProvider
import { useAuth } from "./integrations/supabase/auth"; // Keep useAuth for CallProvider

const queryClient = new QueryClient();

const AppContent = () => {
  const { user } = useAuth(); // Keep useAuth for CallProvider

  // Removed useEffect for push notification setup

  return (
    <BrowserRouter>
      <SessionContextProvider>
        <CallProvider currentUser={user}> {/* Wrap ChatApp with CallProvider */}
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/" element={<ChatApp />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </CallProvider>
      </SessionContextProvider>
    </BrowserRouter>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppContent />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;