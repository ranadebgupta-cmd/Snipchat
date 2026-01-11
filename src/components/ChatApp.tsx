"use client";

import React, { useState, useEffect } from "react";
import { ChatSidebar } from "./ChatSidebar";
import { ChatMessageArea } from "./ChatMessageArea";
import { useAuth } from "@/integrations/supabase/auth";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/utils/toast";
import { User } from "@supabase/supabase-js";
import { Spinner } from "./Spinner";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useIsMobile } from "@/hooks/use-mobile";

// Define types for Supabase data
interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

export interface SupabaseConversation {
  id: string;
  name: string | null;
  created_at: string;
  conversation_participants: {
    user_id: string;
    profiles: Profile;
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
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!user || isAuthLoading) {
      setIsLoadingConversations(false);
      return;
    }

    const fetchConversations = async () => {
      setIsLoadingConversations(true);
      console.log("[ChatApp] Attempting to fetch conversations for user:", user.id);
      
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

        processedConversations.sort((a, b) => {
          const dateA = a.latest_message_created_at ? new Date(a.latest_message_created_at).getTime() : 0;
          const dateB = b.latest_message_created_at ? new Date(b.latest_message_created_at).getTime() : 0;
          return dateB - dateA;
        });

        setConversations(processedConversations);
        if (processedConversations.length > 0 && !selectedConversationId) {
          setSelectedConversationId(processedConversations[0].id);
        } else if (processedConversations.length === 0) {
          setSelectedConversationId(null);
        }
        console.log("[ChatApp] Processed conversations:", processedConversations);
      setIsLoadingConversations(false);
    };

    fetchConversations();

    const channel = supabase
      .channel('public:conversations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        (payload) => {
          console.log('[ChatApp] Conversation change received!', payload);
          fetchConversations();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload) => {
          console.log('[ChatApp] Message change received!', payload);
          fetchConversations();
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
  };

  const handleConversationDeleted = (deletedConversationId: string) => {
    setConversations(prevConversations => {
      const updatedConversations = prevConversations.filter(
        (conv) => conv.id !== deletedConversationId
      );
      if (selectedConversationId === deletedConversationId) {
        setSelectedConversationId(updatedConversations.length > 0 ? updatedConversations[0].id : null);
      }
      return updatedConversations;
    });
  };

  const handleCloseChat = () => {
    setSelectedConversationId(null);
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
    return null;
  }

  const gradientBackgroundClasses = "h-screen bg-gradient-to-br from-blue-200 via-purple-200 to-pink-200 dark:from-gray-800 dark:via-indigo-900 dark:to-purple-950 text-foreground animate-gradient-xy";

  return (
    <div className={gradientBackgroundClasses}>
      <style>{`
        @keyframes gradient-xy {
          0%, 100% {
            background-position: 0% 0%;
          }
          50% {
            background-position: 100% 100%;
          }
        }
        .animate-gradient-xy {
          background-size: 400% 400%;
          animation: gradient-xy 15s ease infinite;
        }
      `}</style>
      {isMobile ? (
        selectedConversationId ? (
          <ChatMessageArea
            conversation={selectedConversation!}
            onSendMessage={handleSendMessage}
            currentUser={user}
            onConversationDeleted={handleConversationDeleted}
            onCloseChat={handleCloseChat}
          />
        ) : (
          <ChatSidebar
            conversations={conversations}
            selectedConversationId={selectedConversationId}
            onSelectConversation={setSelectedConversationId}
            currentUser={user}
          />
        )
      ) : (
        <ResizablePanelGroup
          direction="horizontal"
          className="flex h-screen bg-background text-foreground"
        >
          <ResizablePanel defaultSize={25} minSize={15}>
            <ChatSidebar
              conversations={conversations}
              selectedConversationId={selectedConversationId}
              onSelectConversation={setSelectedConversationId}
              currentUser={user}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={75} minSize={30}>
            {selectedConversation ? (
              <ChatMessageArea
                conversation={selectedConversation}
                onSendMessage={handleSendMessage}
                currentUser={user}
                onConversationDeleted={handleConversationDeleted}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center p-4">
                <div className="w-full max-w-md text-center bg-card/90 backdrop-blur-sm border-2 border-primary/20 shadow-xl animate-fade-in">
                  <div className="p-6">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-message-circle h-16 w-16 mx-auto mb-4 text-primary animate-bounce-slow"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
                    <h3 className="text-3xl font-extrabold text-primary">Welcome to Snipchat!</h3>
                    <p className="text-lg text-muted-foreground mt-2">
                      Start a new adventure! Select a conversation from the sidebar or click the '+' button to create a new one.
                    </p>
                  </div>
                  <div className="p-6 pt-0"></div>
                </div>
              </div>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
};