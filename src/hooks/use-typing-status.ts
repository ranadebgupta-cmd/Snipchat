"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

export interface TypingStatus {
  user_id: string;
  last_typed_at: string;
  profiles: Profile;
}

const TYPING_INDICATOR_TIMEOUT_MS = 3000;

export const useTypingStatus = (conversationId: string, currentUser: User | null) => {
  const [typingUsers, setTypingUsers] = useState<TypingStatus[]>([]);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateTypingStatus = useCallback(async (isTyping: boolean) => {
    if (!currentUser || !conversationId) return;

    console.log(`[useTypingStatus] Updating typing status for user ${currentUser.id} in conversation ${conversationId} to isTyping: ${isTyping}`);
    const { data, error } = await supabase
      .from('typing_status')
      .upsert(
        {
          conversation_id: conversationId,
          user_id: currentUser.id,
          last_typed_at: new Date().toISOString(),
        },
        { onConflict: 'conversation_id,user_id' }
      );

    if (error) {
      console.error("[useTypingStatus] Error updating typing status:", error);
    } else {
      console.log("[useTypingStatus] Typing status upsert successful:", data);
    }
  }, [conversationId, currentUser]);

  const fetchTypingUsers = useCallback(async () => {
    if (!currentUser || !conversationId) return;

    const { data, error } = await supabase
      .from('typing_status')
      .select(
        `
        user_id,
        last_typed_at,
        profiles (
          id,
          first_name,
          last_name
        )
        `
      )
      .eq('conversation_id', conversationId)
      .neq('user_id', currentUser.id);

    if (error) {
      console.error("[useTypingStatus] Error fetching typing status:", error);
      setTypingUsers([]);
    } else {
      const activeTypingUsers: TypingStatus[] = (data || [])
        .map((ts: any) => ({
          user_id: ts.user_id,
          last_typed_at: ts.last_typed_at,
          profiles: Array.isArray(ts.profiles) ? ts.profiles[0] : ts.profiles,
        }))
        .filter(ts => {
          const lastTyped = new Date(ts.last_typed_at).getTime();
          const now = new Date().getTime();
          return (now - lastTyped) < TYPING_INDICATOR_TIMEOUT_MS;
        });
      setTypingUsers(activeTypingUsers);
      console.log("[useTypingStatus] Fetched active typing users:", activeTypingUsers);
    }
  }, [conversationId, currentUser]);

  useEffect(() => {
    fetchTypingUsers();

    const typingChannel = supabase
      .channel(`public:typing_status:conversation_id=eq.${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'typing_status', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          console.log('[useTypingStatus] Typing status change received!', payload);
          fetchTypingUsers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(typingChannel);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [conversationId, fetchTypingUsers]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchTypingUsers();
    }, TYPING_INDICATOR_TIMEOUT_MS / 2);

    return () => clearInterval(interval);
  }, [fetchTypingUsers]);

  const handleTypingChange = (isTyping: boolean) => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    updateTypingStatus(isTyping);

    if (isTyping) {
      typingTimeoutRef.current = setTimeout(() => {
        updateTypingStatus(false);
      }, TYPING_INDICATOR_TIMEOUT_MS);
    }
  };

  const typingIndicatorText = typingUsers.length > 0
    ? `${typingUsers.map(u => u.profiles?.first_name || 'Someone').join(', ')} is typing...`
    : '';

  return { typingUsers, typingIndicatorText, handleTypingChange };
};