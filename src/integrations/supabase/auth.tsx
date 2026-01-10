"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './client';
import { useNavigate } from 'react-router-dom';
import { showSuccess, showError } from '@/utils/toast';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const SessionContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user || null);
        setIsLoading(false);

        if (event === 'SIGNED_IN') {
          showSuccess('Successfully signed in!');
          navigate('/'); // Redirect to home page after sign in
        } else if (event === 'SIGNED_OUT') {
          showSuccess('Successfully signed out!');
          navigate('/login'); // Redirect to login page after sign out
        } else if (event === 'USER_UPDATED') {
          showSuccess('User profile updated!');
        } else if (event === 'PASSWORD_RECOVERY') {
          showSuccess('Password recovery initiated. Check your email!');
        } else if (event === 'MFA_CHALLENGE_VERIFIED') {
          showSuccess('MFA challenge verified!');
        } else if (event === 'INITIAL_SESSION') {
          // Handle initial session, no toast needed
        } else if (event === 'TOKEN_REFRESHED') {
          // Handle token refreshed, no toast needed
        } else {
          // Generic error handling for other events if needed
          console.error("Unhandled auth event:", event);
        }
      }
    );

    // Fetch initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user || null);
      setIsLoading(false);
      if (!session) {
        navigate('/login');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <AuthContext.Provider value={{ session, user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within a SessionContextProvider');
  }
  return context;
};