"use client";

import React, { useState, useRef, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send } from "lucide-react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/utils/toast";
import { SupabaseConversation } from "./ChatApp"; // Import the shared type

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

interface ChatMessageAreaProps {
  conversation: SupabaseConversation;
  onSendMessage: (text: string) => void;
  currentUser: User;
}

export const ChatMessageArea = ({ conversation, onSendMessage, currentUser }: ChatMessageAreaProps) => {
  const [messageInput, setMessageInput] = useState("");
  const [messages, setMessages] = useState<SupabaseMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const fetchMessages = async () => {
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
          )
          `
        )
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error("Error fetching messages:", error);
        showError("Failed to load messages.");
        setMessages([]);
      } else {
        setMessages(data as SupabaseMessage[]);
      }
      setIsLoadingMessages(false);
    };

    fetchMessages();

    // Setup real-time listener for new messages in this conversation
    const channel = supabase
      .channel(`public:messages:conversation_id=eq.${conversation.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          console.log('[ChatMessageArea] New message received!', payload);
          // Re-fetch messages or directly add the new message if payload contains full data
          fetchMessages(); // Simple re-fetch for now
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (messageInput.trim()) {
      onSendMessage(messageInput); // This calls the parent's onSendMessage which inserts into DB
      setMessageInput("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSend();
    }
  };

  const getParticipantProfile = (userId: string) => {
    return conversation.conversation_participants.find(p => p.user_id === userId)?.profiles;
  };

  const getOtherParticipantProfile = () => {
    return conversation.conversation_participants.find(p => p.user_id !== currentUser.id)?.profiles;
  };

  const displayName = conversation.name || `${getOtherParticipantProfile()?.first_name || ''} ${getOtherParticipantProfile()?.last_name || ''}`.trim() || "Unknown Chat";
  const displayAvatar = conversation.name ? "https://api.dicebear.com/7.x/lorelei/svg?seed=GroupChat" : getOtherParticipantProfile()?.avatar_url || `https://api.dicebear.com/7.x/lorelei/svg?seed=${getOtherParticipantProfile()?.first_name || 'User'}`;


  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center p-4 border-b border-border">
        <Avatar className="h-9 w-9">
          <AvatarImage src={displayAvatar} alt={displayName} />
          <AvatarFallback>{displayName.charAt(0)}</AvatarFallback>
        </Avatar>
        <h3 className="ml-3 text-lg font-semibold">{displayName}</h3>
      </div>
      <ScrollArea className="flex-1 p-4">
        {isLoadingMessages ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">Loading messages...</div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => {
              const senderProfile = message.profiles || getParticipantProfile(message.sender_id);
              const senderName = senderProfile?.first_name || "Unknown";
              const senderAvatar = senderProfile?.avatar_url || `https://api.dicebear.com/7.x/lorelei/svg?seed=${senderName}`;

              return (
                <div
                  key={message.id}
                  className={`flex ${
                    message.sender_id === currentUser.id ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`flex items-end max-w-[70%] ${
                      message.sender_id === currentUser.id ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    {message.sender_id !== currentUser.id && (
                      <Avatar className="h-8 w-8 mr-2">
                        <AvatarImage src={senderAvatar} alt={senderName} />
                        <AvatarFallback>{senderName.charAt(0)}</AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={`p-3 rounded-lg ${
                        message.sender_id === currentUser.id
                          ? "bg-primary text-primary-foreground rounded-br-none"
                          : "bg-muted text-muted-foreground rounded-bl-none"
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
                      <span className="text-xs opacity-75 mt-1 block text-right">
                        {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>
      <div className="p-4 border-t border-border flex items-center">
        <Input
          placeholder="Type your message..."
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyPress={handleKeyPress}
          className="flex-1 mr-2"
        />
        <Button onClick={handleSend} disabled={!messageInput.trim()}>
          <Send className="h-4 w-4" />
          <span className="sr-only">Send message</span>
        </Button>
      </div>
    </div>
  );
};