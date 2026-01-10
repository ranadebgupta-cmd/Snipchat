"use client";

import React, { useState, useEffect } from "react";
import { ChatSidebar } from "./ChatSidebar";
import { ChatMessageArea } from "./ChatMessageArea";
import { useAuth } from "@/integrations/supabase/auth";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/utils/toast";
import { User } from "@supabase/supabase-js";
import { Spinner } from "./Spinner"; // Import the Spinner component

// Define types for Supabase data
interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

interface SupabaseMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  profiles: Profile; // Joined profile data
}

export interface SupabaseConversation {
  id: string;
  name: string | null;
  created_at: string;
  conversation_participants: {
    user_id: string;
    profiles: Profile; // Joined profile data for participants
  }[];
  messages: SupabaseMessage[]; // Latest message for display in sidebar
}

export const ChatApp = () => {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [conversations, setConversations] = useState<SupabaseConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);

  useEffect(() => {
    if (!user || isAuthLoading) {
      setIsLoadingConversations(false);
      return;
    }

    const fetchConversations = async () => {
      setIsLoadingConversations(true);
      console.log("[ChatApp] Attempting to fetch conversations for user:", user.id);
      const { data, error } = await supabase
        .from('conversation_participants')
        .select(
          `
          conversations (
            id,
            name,
            created_at,
            conversation_participants (
              user_id,
              profiles (
                id,
                first_name,
                last_name,
                avatar_url
              )
            ),
            messages (
              id,
              sender_id,
              content,
              created_at,
              profiles (
                id,
                first_name,
                last_name,
                avatar_url
              ),
              order=created_at.desc,
              limit=1
            )
          )
          `
        )
        .eq('user_id', user.id);
        // Removed the .order() and .limit() calls that were outside the select string
        // as they are now handled within the nested 'messages' select.

      if (error) {
        console.error("[ChatApp] Error fetching conversations:", error);
        showError(`Failed to load conversations: ${error.message}`); // More detailed error
      } else {
        console.log("[ChatApp] Successfully fetched raw conversations data:", data);
        // Flatten the data structure and process it
        const processedConversations: SupabaseConversation[] = (data || [])
          .map((cp: any) => {
            const conv = cp.conversations;
            if (!conv) return null;

            // Process conversation participants to ensure 'profiles' is a single object
            const processedParticipants = (conv.conversation_participants || []).map((participant: any) => ({
              user_id: participant.user_id,
              profiles: Array.isArray(participant.profiles) ? participant.profiles[0] : participant.profiles,
            }));

            // Ensure messages is an array and get the latest one, processing its profile
            const latestMessage = conv.messages && conv.messages.length > 0 ? conv.messages[0] : null;
            const processedLatestMessage = latestMessage ? {
              id: latestMessage.id,
              conversation_id: latestMessage.conversation_id,
              sender_id: latestMessage.sender_id,
              content: latestMessage.content,
              created_at: latestMessage.created_at,
              profiles: Array.isArray(latestMessage.profiles) ? latestMessage.profiles[0] : latestMessage.profiles,
            } : null;

            return {
              id: conv.id,
              name: conv.name,
              created_at: conv.created_at,
              conversation_participants: processedParticipants,
              messages: processedLatestMessage ? [processedLatestMessage] : [], // Store only the latest message for sidebar display
            };
          })
          .filter(Boolean) as SupabaseConversation[]; // Cast after filtering nulls

        setConversations(processedConversations);
        if (processedConversations.length > 0 && !selectedConversationId) {
          setSelectedConversationId(processedConversations[0].id);
        }
        console.log("[ChatApp] Processed conversations:", processedConversations);
      }
      setIsLoadingConversations(false);
    };

    fetchConversations();

    // Setup real-time listener for new messages or conversation updates
    const channel = supabase
      .channel('public:conversations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        (payload) => {
          console.log('[ChatApp] Conversation change received!', payload);
          fetchConversations(); // Re-fetch conversations for simplicity
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload) => {
          console.log('[ChatApp] Message change received!', payload);
          fetchConversations(); // Re-fetch conversations for simplicity
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isAuthLoading, selectedConversationId]);

  const selectedConversation = conversations.find(
    (conv) => conv.id === selectedConversationId
  );

  const handleSendMessage = async (text: string) => {
    if (!user || !selectedConversationId || !text.trim()) return;

    const { error } = await supabase.from('messages').insert({
      conversation_id: selectedConversationId,
      sender_id: user.id,
      content: text,
    });

    if (error) {
      console.error("Error sending message:", error);
      showError("Failed to send message.");
    }
    // The real-time listener in ChatMessageArea will handle updating the UI
  };

  if (isAuthLoading || isLoadingConversations) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-background">
        <Spinner size="lg" />
        <p className="ml-3 text-lg text-muted-foreground">Loading chat...</p>
      </div>
    );
  }

  if (!user) {
    // Should be redirected by SessionContextProvider, but as a fallback
    return null;
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <div className="w-1/4 border-r border-border">
        <ChatSidebar
          conversations={conversations}
          selectedConversationId={selectedConversationId}
          onSelectConversation={setSelectedConversationId}
          currentUser={user}
        />
      </div>
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <ChatMessageArea
            conversation={selectedConversation}
            onSendMessage={handleSendMessage}
            currentUser={user}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Select a conversation to start chatting or start a new one.
          </div>
        )}
      </div>
    </div>
  );
};