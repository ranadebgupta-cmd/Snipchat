"use client";

import React, { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useLocation } from 'react-router-dom';
import { Spinner } from './Spinner';
import { showError } from '@/utils/toast';
import { CallProvider } from './CallProvider';

interface SessionContextProps {
  children: React.ReactNode;
}

export const SessionContextProvider = ({ children }: SessionContextProps) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    console.log("[SessionContextProvider] useEffect mounted. Initial isLoading:", isLoading);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      console.log(`[SessionContextProvider] onAuthStateChange event: ${_event}, session:`, currentSession);
      setSession(currentSession);
      setIsLoading(false); // Ensure isLoading is set to false after any auth state change

      if (_event === 'SIGNED_OUT') {
        if (location.pathname !== '/login') {
          navigate('/login');
          showError("You have been logged out.");
        }
      } else if (currentSession && location.pathname === '/login') {
        navigate('/');
      } else if (!currentSession && location.pathname !== '/login') {
        navigate('/login');
      }
    });

    const getInitialSession = async () => {
      console.log("[SessionContextProvider] getInitialSession started.");
      const { data: { session: initialSession }, error } = await supabase.auth.getSession();
      if (error) {
        console.error("[SessionContextProvider] Error getting initial session:", error);
        showError("Failed to load session.");
      }
      console.log("[SessionContextProvider] getInitialSession finished. Initial session:", initialSession);
      setSession(initialSession);
      setIsLoading(false); // Ensure isLoading is set to false after initial session check

      if (!initialSession && location.pathname !== '/login') {
        navigate('/login');
      } else if (initialSession && location.pathname === '/login') {
        navigate('/');
      }
    };

    getInitialSession();

    return () => {
      console.log("[SessionContextProvider] useEffect unmounted.");
      subscription.unsubscribe();
    };
  }, [navigate, location.pathname]); // Dependencies for useEffect

  console.log("[SessionContextProvider] Render. Current isLoading:", isLoading, "Current session:", session);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-background">
        <Spinner size="lg" />
        <p className="ml-3 text-lg text-muted-foreground">Loading session...</p>
      </div>
    );
  }

  return (
    <CallProvider currentUser={session?.user || null}>
      {children}
    </CallProvider>
  );
};