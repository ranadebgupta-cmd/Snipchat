"use client";

import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from './client';

interface AuthState {
  user: User | null;
  isLoading: boolean;
}

export const useAuth = (): AuthState => {
  const [authState, setAuthState] = useState<AuthState>({ user: null, isLoading: true });

  useEffect(() => {
    const getSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.error("[useAuth] Error getting session:", error);
      }
      setAuthState({ user: session?.user || null, isLoading: false });
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthState({ user: session?.user || null, isLoading: false });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return authState;
};