"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, CheckCheck } from "lucide-react"; // Import CheckCheck icon for seen status
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/utils/toast";
import { SupabaseConversation } from "./ChatApp";
import { Spinner } from "./Spinner";

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

interface SupabaseMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  profiles: Profile; // Joined profile data
  message_receipts?: MessageReceipt[]; // Optional: receipts for this message
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
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const markMessagesAsSeen = useCallback(async (messageIds: string[]) => {
    if (!currentUser || messageIds.length === 0) return;

    const receiptsToInsert = messageIds.map(messageId => ({
      message_id: messageId,
      user_id: currentUser.id,
    }));

    const { error } = await supabase
      .from('message_receipts')
      .insert(receiptsToInsert)
      .select(); // Select to get the inserted data, useful for debugging

    if (error && error.code !== '23505') { // 23505 is unique_violation, which means receipt already exists
      console.error("[ChatMessageArea] Error marking messages as seen:", error);
    }
  }, [currentUser]);

  const fetchMessages = useCallback(async () => {
    if (!currentUser) return;

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
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error("Error fetching messages:", error);
      showError("Failed to load messages.");
      setMessages([]);
    } else {
      const fetchedMessages = data as SupabaseMessage[];
      setMessages(fetchedMessages);

      // Identify messages sent by others that the current user hasn't seen yet
      const unseenMessageIds = fetchedMessages
        .filter(msg => msg.sender_id !== currentUser.id && !msg.message_receipts?.some(r => r.user_id === currentUser.id))
        .map(msg => msg.id);

      if (unseenMessageIds.length > 0) {
        await markMessagesAsSeen(unseenMessageIds);
        // Re-fetch messages to show updated seen status for the current user
        // This might cause a slight flicker, but ensures data consistency.
        // For a more optimized approach, we could update state directly.
        fetchMessages();
      }
    }
    setIsLoadingMessages(false);
  }, [conversation.id, currentUser, markMessagesAsSeen]);

  useEffect(() => {
    fetchMessages();

    const channel = supabase
      .channel(`public:messages:conversation_id=eq.${conversation.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          console.log('[ChatMessageArea] New message received!', payload);
          fetchMessages();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_receipts', filter: `message_id=in.(${messages.map(m => m.id).join(',')})` },
        (payload) => {
          console.log('[ChatMessageArea] New message receipt received!', payload);
          fetchMessages(); // Re-fetch to update seen status
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation.id, fetchMessages, messages]); // Added messages to dependency array to update filter for receipts

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!messageInput.trim()) return;

    setIsSendingMessage(true);
    await onSendMessage(messageInput);
    setMessageInput("");
    setIsSendingMessage(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && messageInput.trim() && !isSendingMessage) {
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

  const isMessageSeenByAllOthers = (message: SupabaseMessage) => {
    if (message.sender_id !== currentUser.id || !message.message_receipts) return false;

    const otherParticipants = conversation.conversation_participants.filter(p => p.user_id !== currentUser.id);
    if (otherParticipants.length === 0) return false; // No other participants to see it

    return otherParticipants.every(otherP =>
      message.message_receipts?.some(receipt => receipt.user_id === otherP.user_id)
    );
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center p-4 border-b border-border bg-card text-card-foreground shadow-sm">
        <Avatar className="h-10 w-10">
          <AvatarImage src={displayAvatar} alt={displayName} />
          <AvatarFallback>{displayName.charAt(0)}</AvatarFallback>
        </Avatar>
        <h3 className="ml-3 text-lg font-semibold">{displayName}</h3>
      </div>
      <ScrollArea className="flex-1 p-4 bg-muted/20">
        {isLoadingMessages ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <Spinner size="md" />
            <p className="ml-2">Loading messages...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => {
              const senderProfile = message.profiles || getParticipantProfile(message.sender_id);
              const senderName = senderProfile?.first_name || "Unknown";
              const senderAvatar = senderProfile?.avatar_url || `https://api.dicebear.com/7.x/lorelei/svg?seed=${senderName}`;
              const seenByAll = isMessageSeenByAllOthers(message);

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
                      className={`p-3 rounded-xl ${
                        message.sender_id === currentUser.id
                          ? "bg-primary text-primary-foreground rounded-br-none"
                          : "bg-secondary text-secondary-foreground rounded-bl-none"
                      } shadow-md`}
                    >
                      <p className="text-sm">{message.content}</p>
                      <div className="flex items-center justify-end text-xs opacity-75 mt-1">
                        <span>
                          {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {message.sender_id === currentUser.id && seenByAll && (
                          <CheckCheck className="h-3 w-3 ml-1 text-primary-foreground" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>
      <div className="p-4 border-t border-border flex items-center bg-card">
        <Input
          placeholder="Type your message..."
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyPress={handleKeyPress}
          className="flex-1 mr-2 focus-visible:ring-primary"
          disabled={isSendingMessage}
        />
        <Button onClick={handleSend} disabled={!messageInput.trim() || isSendingMessage}>
          {isSendingMessage ? <Spinner size="sm" className="text-primary-foreground" /> : <Send className="h-4 w-4" />}
          <span className="sr-only">Send message</span>
        </Button>
      </div>
    </div>
  );
};