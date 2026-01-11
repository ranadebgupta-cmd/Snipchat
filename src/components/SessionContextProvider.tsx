"use client";

import React, { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useLocation } from 'react-router-dom';
import { Spinner } from './Spinner';
import { showError } from '@/utils/toast';
// Removed import for unregisterPushNotifications

interface SessionContextProps {
  children: React.ReactNode;
}

export const SessionContextProvider = ({ children }: SessionContextProps) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setIsLoading(false);

      if (_event === 'SIGNED_OUT') {
        // Removed unregisterPushNotifications call
        if (location.pathname !== '/login') {
          navigate('/login');
          showError("You have been logged out.");
        }
      } else if (currentSession && location.pathname === '/login') {
        navigate('/'); // Redirect to home if already logged in and on login page
      } else if (!currentSession && location.pathname !== '/login') {
        navigate('/login'); // Redirect to login if not logged in and not on login page
      }
    });

    // Initial session check
    const getInitialSession = async () => {
      const { data: { session: initialSession }, error } = await supabase.auth.getSession();
      if (error) {
        console.error("[SessionContextProvider] Error getting initial session:", error);
        showError("Failed to load session.");
      }
      setSession(initialSession);
      setIsLoading(false);

      if (!initialSession && location.pathname !== '/login') {
        navigate('/login');
      } else if (initialSession && location.pathname === '/login') {
        navigate('/');
      }
    };

    getInitialSession();

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate, location.pathname, session?.user]);
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-background">
        <Spinner size="lg" />
        <p className="ml-3 text-lg text-muted-foreground">Loading session...</p>
      </div>
    );
  }

  return <>{children}</>;
};