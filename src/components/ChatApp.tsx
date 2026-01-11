"use client";

import React, { useState, useEffect, useCallback } from "react";
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
import { MessageCircle } from "lucide-react";

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

// Define Message type for real-time updates
interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export const ChatApp = () => {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [conversations, setConversations] = useState<SupabaseConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const isMobile = useIsMobile();

  // Function to fetch conversations without managing selectedConversationId
  const fetchAndSetConversations = useCallback(async () => {
    console.log("[ChatApp] fetchAndSetConversations called.");
    if (!user) {
      setConversations([]);
      console.log("[ChatApp] No user, clearing conversations.");
      return;
    }

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
      setConversations([]);
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
      // Continue with conversations even if latest messages fail
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
      console.log("[ChatApp] Conversations fetched and set:", processedConversations);
  }, [user]); // Only depends on user

  // Effect for initial load and setting selected conversation
  useEffect(() => {
    if (!user || isAuthLoading) {
      setIsLoadingConversations(false);
      console.log("[ChatApp] Auth loading or no user, skipping initial conversation fetch.");
      return;
    }

    const initializeChat = async () => {
      setIsLoadingConversations(true);
      console.log("[ChatApp] Initializing chat: fetching conversations.");
      await fetchAndSetConversations(); // Fetch conversations
      setIsLoadingConversations(false);
      console.log("[ChatApp] Initial chat setup complete.");
    };

    initializeChat();
  }, [user, isAuthLoading, fetchAndSetConversations]); // Re-run when user or auth loading state changes

  // Effect for real-time subscriptions
  useEffect(() => {
    if (!user) {
      console.log("[ChatApp] No user, skipping real-time subscriptions.");
      return;
    }

    console.log("[ChatApp] Setting up real-time subscriptions for conversations and messages.");
    const channel = supabase
      .channel('public:conversations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        (payload) => {
          console.log("[ChatApp] Real-time conversation change detected:", payload);
          fetchAndSetConversations(); // Re-fetch on conversation changes (e.g., new conversation created)
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' }, // Listen only for new messages
        (payload) => {
          console.log("[ChatApp] Real-time new message payload received:", payload);
          const newMessage = payload.new as Message;

          setConversations(prevConversations => {
            console.log("[ChatApp] Previous conversations state for real-time update:", prevConversations);
            const updatedConversations = prevConversations.map(conv => {
              if (conv.id === newMessage.conversation_id) {
                console.log(`[ChatApp] Updating conversation ${conv.id} with new message.`);
                return {
                  ...conv,
                  latest_message_content: newMessage.content,
                  latest_message_sender_id: newMessage.sender_id,
                  latest_message_created_at: newMessage.created_at,
                };
              }
              return conv;
            });

            // Sort to bring the updated conversation to the top
            updatedConversations.sort((a, b) => {
              const dateA = a.latest_message_created_at ? new Date(a.latest_message_created_at).getTime() : 0;
              const dateB = b.latest_message_created_at ? new Date(b.latest_message_created_at).getTime() : 0;
              return dateB - dateA;
            });

            console.log("[ChatApp] Conversations state updated for sidebar (real-time message):", updatedConversations);
            return updatedConversations;
          });
        }
      )
      .subscribe();

    return () => {
      console.log("[ChatApp] Unsubscribing from real-time channels.");
      supabase.removeChannel(channel);
    };
  }, [user, fetchAndSetConversations]); // Only depends on user and the memoized fetch function

  // Effect to manage selectedConversationId when conversations change
  useEffect(() => {
    if (conversations.length > 0 && (!selectedConversationId || !conversations.some(c => c.id === selectedConversationId))) {
      setSelectedConversationId(conversations[0].id);
      console.log("[ChatApp] Setting selected conversation to first available:", conversations[0].id);
    } else if (conversations.length === 0) {
      setSelectedConversationId(null);
      console.log("[ChatApp] No conversations, clearing selected conversation.");
    }
  }, [conversations, selectedConversationId]); // Only re-run when conversations or selectedConversationId changes

  const selectedConversation = conversations.find(
    (conv) => conv.id === selectedConversationId
  );

  const handleSendMessage = async (text: string) => {
    if (!user || !selectedConversationId || !text.trim()) return;

    console.log("[ChatApp] Sending message:", text, "to conversation:", selectedConversationId);
    const { error } = await supabase.from('messages').insert({
      conversation_id: selectedConversationId,
      sender_id: user.id,
      content: text,
    });

    if (error) {
      console.error("[ChatApp] Error sending message:", error);
      showError("Failed to send message.");
    } else {
      console.log("[ChatApp] Message sent successfully.");
    }
  };

  const handleConversationDeleted = (deletedConversationId: string) => {
    console.log("[ChatApp] Handling conversation deletion:", deletedConversationId);
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
    console.log("[ChatApp] Closing chat (mobile view).");
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
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-screen-xl h-[90vh] rounded-xl overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <ResizablePanelGroup
            direction="horizontal"
            className="h-full"
          >
            <ResizablePanel
              defaultSize={isMobile && selectedConversationId ? 0 : 30}
              minSize={isMobile ? 0 : 20}
              maxSize={isMobile ? 100 : 40}
              collapsible={isMobile}
              collapsedSize={isMobile ? 0 : 20}
              onCollapse={() => isMobile && setSelectedConversationId(null)}
              onExpand={() => isMobile && setSelectedConversationId(null)}
            >
              <ChatSidebar
                conversations={conversations}
                selectedConversationId={selectedConversationId}
                onSelectConversation={setSelectedConversationId}
                currentUser={user}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              defaultSize={isMobile && selectedConversationId ? 70 : 0}
              minSize={isMobile ? 0 : 30}
              maxSize={isMobile ? 100 : 80}
              collapsible={isMobile}
              collapsedSize={isMobile ? 0 : 30}
              onCollapse={() => isMobile && setSelectedConversationId(null)}
              onExpand={() => { /* No specific action needed on expand, state should already be correct */ }}
            >
              {selectedConversation ? (
                <ChatMessageArea
                  conversation={selectedConversation}
                  onSendMessage={handleSendMessage}
                  currentUser={user}
                  onConversationDeleted={handleConversationDeleted}
                  onCloseChat={isMobile ? handleCloseChat : undefined}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center p-4 h-full bg-gray-50 dark:bg-gray-800">
                  <div className="w-full max-w-md text-center bg-card/90 backdrop-blur-sm border-2 border-primary/20 shadow-xl rounded-lg animate-fade-in p-8">
                    <MessageCircle className="h-20 w-20 mx-auto mb-6 text-primary animate-bounce-slow" />
                    <h3 className="text-4xl font-extrabold text-primary mb-3">Welcome to Snipchat!</h3>
                    <p className="text-lg text-muted-foreground mt-2">
                      Start a new adventure! Select a conversation from the sidebar or click the '+' button to create a new one.
                    </p>
                  </div>
                </div>
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  );
};