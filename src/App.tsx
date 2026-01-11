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
import { useEffect } from "react";
import { useAuth } from "./integrations/supabase/auth";
import { requestPushNotificationPermissions, registerPushNotifications, setupPushNotificationListeners, unregisterPushNotifications } from "./integrations/supabase/pushNotifications";

const queryClient = new QueryClient();

const AppContent = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      const setupNotifications = async () => {
        const granted = await requestPushNotificationPermissions();
        if (granted) {
          setupPushNotificationListeners(user.id);
          registerPushNotifications(user.id);
        }
      };
      setupNotifications();

      return () => {
        // Optionally unregister on component unmount or user logout
        // unregisterPushNotifications(user.id); // This is handled in SessionContextProvider on SIGNED_OUT
      };
    }
  }, [user]);

  return (
    <BrowserRouter>
      <SessionContextProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/" element={<ChatApp />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
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