"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, CheckCheck, Trash2 } from "lucide-react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { showError, showSuccess } from "@/utils/toast";
import { SupabaseConversation } from "./ChatApp";
import { Spinner } from "./Spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

interface TypingStatus {
  user_id: string;
  last_typed_at: string;
  profiles: Profile; // Joined profile data for the typing user
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
  const [typingUsers, setTypingUsers] = useState<TypingStatus[]>([]);
  const [messageToDeleteId, setMessageToDeleteId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const TYPING_INDICATOR_TIMEOUT_MS = 3000;

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
      .select();

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
      console.error("[ChatMessageArea] Error fetching messages:", error);
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

      // Identify messages sent by others that the current user hasn't seen yet
      const unseenMessageIds = fetchedMessages
        .filter(msg => msg.sender_id !== currentUser.id && !msg.message_receipts?.some(r => r.user_id === currentUser.id))
        .map(msg => msg.id);

      if (unseenMessageIds.length > 0) {
        await markMessagesAsSeen(unseenMessageIds);
      }
    }
    setIsLoadingMessages(false);
  }, [conversation.id, currentUser, markMessagesAsSeen]);

  // Function to fetch typing users
  const fetchTypingUsers = useCallback(async () => {
    if (!currentUser) return;

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
      .eq('conversation_id', conversation.id)
      .neq('user_id', currentUser.id); // Exclude current user's own typing status

    if (error) {
      console.error("[ChatMessageArea] Error fetching typing status:", error);
      setTypingUsers([]);
    } else {
      const activeTypingUsers: TypingStatus[] = (data || [])
        .map((ts: any) => ({
          user_id: ts.user_id,
          last_typed_at: ts.last_typed_at,
          profiles: Array.isArray(ts.profiles) ? ts.profiles[0] : ts.profiles,
        }))
        .filter(ts => {
          // Only consider users who typed recently (e.g., in the last few seconds)
          const lastTyped = new Date(ts.last_typed_at).getTime();
          const now = new Date().getTime();
          return (now - lastTyped) < TYPING_INDICATOR_TIMEOUT_MS;
        });
      setTypingUsers(activeTypingUsers);
      console.log("[ChatMessageArea] Fetched active typing users:", activeTypingUsers);
    }
  }, [conversation.id, currentUser]);

  // Effect for fetching messages and setting up real-time listeners
  useEffect(() => {
    fetchMessages();

    const messagesChannel = supabase
      .channel(`public:messages:conversation_id=eq.${conversation.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          console.log('[ChatMessageArea] Message change received!', payload);
          fetchMessages();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_receipts', filter: `conversation_id=eq.${conversation.id}` }, // Filter by conversation_id
        (payload) => {
          console.log('[ChatMessageArea] New message receipt received!', payload);
          fetchMessages(); // Re-fetch to update seen status
        }
      )
      .subscribe();

    const typingChannel = supabase
      .channel(`public:typing_status:conversation_id=eq.${conversation.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'typing_status', filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          console.log('[ChatMessageArea] Typing status change received!', payload);
          fetchTypingUsers(); // Fetch typing users to update the list
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(typingChannel);
    };
  }, [conversation.id, fetchMessages, fetchTypingUsers]);

  // Effect for scrolling to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Periodically clean up stale typing indicators
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTypingUsers();
    }, TYPING_INDICATOR_TIMEOUT_MS / 2); // Check every half timeout duration

    return () => clearInterval(interval);
  }, [fetchTypingUsers]);


  const updateTypingStatus = useCallback(async (isTyping: boolean) => {
    if (!currentUser || !conversation.id) return;

    console.log(`[ChatMessageArea] Updating typing status for user ${currentUser.id} in conversation ${conversation.id} to isTyping: ${isTyping}`);
    const { data, error } = await supabase
      .from('typing_status')
      .upsert(
        {
          conversation_id: conversation.id,
          user_id: currentUser.id,
          last_typed_at: new Date().toISOString(),
        },
        { onConflict: 'conversation_id,user_id' }
      );

    if (error) {
      console.error("[ChatMessageArea] Error updating typing status:", error);
    } else {
      console.log("[ChatMessageArea] Typing status upsert successful:", data);
    }
  }, [currentUser, conversation.id]);

  const handleMessageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);

    // Debounce typing status updates
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    updateTypingStatus(true); // Mark as typing immediately

    typingTimeoutRef.current = setTimeout(() => {
      // After a delay, if no more typing, consider user stopped typing
      updateTypingStatus(false);
    }, TYPING_INDICATOR_TIMEOUT_MS);
  };

  const handleSend = async () => {
    if (!messageInput.trim()) return;

    setIsSendingMessage(true);
    await onSendMessage(messageInput);
    setMessageInput("");
    setIsSendingMessage(false);
    // Also update typing status to 'not typing' after sending a message
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    updateTypingStatus(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && messageInput.trim() && !isSendingMessage) {
      handleSend();
    }
  };

  const handleDeleteClick = (messageId: string) => {
    setMessageToDeleteId(messageId);
  };

  const confirmDeleteMessage = async () => {
    if (!messageToDeleteId) return;

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageToDeleteId);

    if (error) {
      console.error("[ChatMessageArea] Error deleting message:", error);
      showError("Failed to delete message.");
    } else {
      showSuccess("Message deleted successfully!");
      fetchMessages(); // Re-fetch messages to update the UI
    }
    setMessageToDeleteId(null); // Close the dialog
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

  const typingIndicatorText = typingUsers.length > 0
    ? `${typingUsers.map(u => u.profiles?.first_name || 'Someone').join(', ')} is typing...`
    : '';

  console.log("[ChatMessageArea] Current typingUsers state:", typingUsers);
  console.log("[ChatMessageArea] typingIndicatorText:", typingIndicatorText);

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
              const senderProfile = message.profiles || { id: message.sender_id, first_name: "User", last_name: "", avatar_url: `https://api.dicebear.com/7.x/lorelei/svg?seed=User` };
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
                    className={`flex items-end max-w-[70%] group ${
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
                      className={`p-3 rounded-xl relative ${
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
                      {message.sender_id === currentUser.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-primary-foreground bg-primary/80 hover:bg-primary"
                          onClick={() => handleDeleteClick(message.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                          <span className="sr-only">Delete message</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>
      {typingIndicatorText && (
        <div className="p-2 text-sm text-muted-foreground bg-muted/20">
          {typingIndicatorText}
        </div>
      )}
      <div className="p-4 border-t border-border flex items-center bg-card">
        <Input
          placeholder="Type your message..."
          value={messageInput}
          onChange={handleMessageInputChange}
          onKeyPress={handleKeyPress}
          className="flex-1 mr-2 focus-visible:ring-primary"
          disabled={isSendingMessage}
        />
        <Button onClick={handleSend} disabled={!messageInput.trim() || isSendingMessage}>
          {isSendingMessage ? <Spinner size="sm" className="text-primary-foreground" /> : <Send className="h-4 w-4" />}
          <span className="sr-only">Send message</span>
        </Button>
      </div>

      <AlertDialog open={!!messageToDeleteId} onOpenChange={(open) => !open && setMessageToDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your message.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteMessage}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};