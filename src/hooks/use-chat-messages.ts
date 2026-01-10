"use client";

import { useState, useEffect, useCallback } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/utils/toast";

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

interface MessageReceipt {
  message_id: string;
  user_id: string;
  seen_at: string;
}

export interface SupabaseMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  profiles: Profile;
  message_receipts?: MessageReceipt[];
}

export const useChatMessages = (conversationId: string, currentUser: User | null) => {
  const [messages, setMessages] = useState<SupabaseMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);

  const markMessagesAsSeen = useCallback(async (messageIds: string[]) => {
    if (!currentUser || messageIds.length === 0) return;

    const receiptsToInsert = messageIds.map(messageId => ({
      message_id: messageId,
      user_id: currentUser.id,
    }));

    const { error } = await supabase
      .from('message_receipts')
      .insert(receiptsToInsert)
      .select();

    if (error && error.code !== '23505') { // 23505 is unique_violation, which means receipt already exists
      console.error("[useChatMessages] Error marking messages as seen:", error);
    }
  }, [currentUser]);

  const fetchMessages = useCallback(async () => {
    if (!currentUser || !conversationId) {
      setIsLoadingMessages(false);
      return;
    }

    setIsLoadingMessages(true);
    const { data, error } = await supabase
      .from('messages')
      .select(
        `
        id,
        conversation_id,
        sender_id,
        content,
        created_at,
        profiles (
          id,
          first_name,
          last_name,
          avatar_url
        ),
        message_receipts (
          message_id,
          user_id,
          seen_at
        )
        `
      )
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error("[useChatMessages] Error fetching messages:", error);
      showError("Failed to load messages.");
      setMessages([]);
    } else {
      const fetchedMessages: SupabaseMessage[] = (data || []).map((msg: any) => ({
        id: msg.id,
        conversation_id: msg.conversation_id,
        sender_id: msg.sender_id,
        content: msg.content,
        created_at: msg.created_at,
        profiles: Array.isArray(msg.profiles) ? msg.profiles[0] : msg.profiles,
        message_receipts: msg.message_receipts || [],
      }));
      setMessages(fetchedMessages);

      const unseenMessageIds = fetchedMessages
        .filter(msg => msg.sender_id !== currentUser.id && !msg.message_receipts?.some(r => r.user_id === currentUser.id))
        .map(msg => msg.id);

      if (unseenMessageIds.length > 0) {
        await markMessagesAsSeen(unseenMessageIds);
      }
    }
    setIsLoadingMessages(false);
  }, [conversationId, currentUser, markMessagesAsSeen]);

  useEffect(() => {
    fetchMessages();

    const messagesChannel = supabase
      .channel(`public:messages:conversation_id=eq.${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          console.log('[useChatMessages] Message change received!', payload);
          fetchMessages();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_receipts', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          console.log('[useChatMessages] New message receipt received!', payload);
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
    };
  }, [conversationId, fetchMessages]);

  return { messages, isLoadingMessages, fetchMessages };
};