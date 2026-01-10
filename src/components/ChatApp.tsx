"use client";

import React, { useState, useEffect } from "react";
import { ChatSidebar } from "./ChatSidebar";
import { ChatMessageArea } from "./ChatMessageArea";
import { useAuth } from "@/integrations/supabase/auth";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/utils/toast";
import { User } from "@supabase/supabase-js";
import { Spinner } from "./Spinner";

// Define types for Supabase data
interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

// Updated interface to use the new view structure
export interface SupabaseConversation {
  id: string;
  name: string | null;
  created_at: string;
  conversation_participants: {
    user_id: string;
    profiles: Profile; // Joined profile data for participants
  }[];
  latest_message_content: string | null;
  latest_message_sender_id: string | null;
  latest_message_created_at: string | null;
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
      
      // 1. Fetch basic conversation data and participants
      const { data: rawConversationsData, error: conversationsError } = await supabase
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
            )
          )
          `
        )
        .eq('user_id', user.id);

      if (conversationsError) {
        console.error("[ChatApp] Error fetching conversations:", conversationsError);
        showError(`Failed to load conversations: ${conversationsError.message}`);
        setIsLoadingConversations(false);
        return;
      }

      const rawConversations = rawConversationsData || [];
      const conversationIds = rawConversations.map((cp: any) => cp.conversations.id);

      // 2. Fetch latest messages for all these conversations using the new view
      const { data: latestMessagesData, error: latestMessagesError } = await supabase
        .from('conversation_last_message')
        .select('*')
        .in('conversation_id', conversationIds);

      if (latestMessagesError) {
        console.error("[ChatApp] Error fetching latest messages:", latestMessagesError);
        showError(`Failed to load latest messages: ${latestMessagesError.message}`);
        setIsLoadingConversations(false);
        return;
      }

      const latestMessagesMap = new Map(latestMessagesData?.map(msg => [msg.conversation_id, msg]));

      // 3. Process and combine the data
      const processedConversations: SupabaseConversation[] = rawConversations
        .map((cp: any) => {
          const conv = cp.conversations;
          if (!conv) return null;

          const processedParticipants = (conv.conversation_participants || []).map((participant: any) => ({
            user_id: participant.user_id,
            profiles: Array.isArray(participant.profiles) ? participant.profiles[0] : participant.profiles,
          }));

          const lastMessage = latestMessagesMap.get(conv.id);

          return {
            id: conv.id,
            name: conv.name,
            created_at: conv.created_at,
            conversation_participants: processedParticipants,
            latest_message_content: lastMessage?.latest_message_content || null,
            latest_message_sender_id: lastMessage?.latest_message_sender_id || null,
            latest_message_created_at: lastMessage?.latest_message_created_at || null,
          };
        })
        .filter(Boolean) as SupabaseConversation[];

        // Sort conversations by the latest message's created_at for display
        processedConversations.sort((a, b) => {
          const dateA = a.latest_message_created_at ? new Date(a.latest_message_created_at).getTime() : 0;
          const dateB = b.latest_message_created_at ? new Date(b.latest_message_created_at).getTime() : 0;
          return dateB - dateA; // Descending order
        });

        setConversations(processedConversations);
        if (processedConversations.length > 0 && !selectedConversationId) {
          setSelectedConversationId(processedConversations[0].id);
        } else if (processedConversations.length === 0) {
          setSelectedConversationId(null); // No conversations left
        }
        console.log("[ChatApp] Processed conversations:", processedConversations);
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

  const handleConversationDeleted = (deletedConversationId: string) => {
    setConversations(prevConversations => {
      const updatedConversations = prevConversations.filter(
        (conv) => conv.id !== deletedConversationId
      );
      // If the deleted conversation was selected, select the first available one or none
      if (selectedConversationId === deletedConversationId) {
        setSelectedConversationId(updatedConversations.length > 0 ? updatedConversations[0].id : null);
      }
      return updatedConversations;
    });
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
            onConversationDeleted={handleConversationDeleted} // Pass the new callback
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