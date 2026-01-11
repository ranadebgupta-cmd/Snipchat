"use client";

import React, { useState, useEffect, useRef } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { showError, showSuccess } from "@/utils/toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Send, Trash2, PhoneCall, ArrowLeft } from "lucide-react";
import { SupabaseConversation } from "./ChatApp";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useCall } from "./CallProvider";
import { format } from 'date-fns';
import { useDebouncedCallback } from 'use-debounce';

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

// Raw message data directly from the 'messages' table
interface RawMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

// Enriched message data for display (includes sender profile)
interface Message extends RawMessage {
  profiles: Profile | null;
}

interface ChatMessageAreaProps {
  conversation: SupabaseConversation;
  onSendMessage: (text: string) => void;
  currentUser: User;
  onConversationDeleted: (conversationId: string) => void;
  onCloseChat?: () => void;
}

export const ChatMessageArea = ({
  conversation,
  onSendMessage,
  currentUser,
  onConversationDeleted,
  onCloseChat,
}: ChatMessageAreaProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessageContent, setNewMessageContent] = useState("");
  const [typingUsers, setTypingUsers] = useState<Profile[]>([]);
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { startCall, activeCall } = useCall();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Effect for fetching messages
  useEffect(() => {
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*, profiles(*)')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error("[ChatMessageArea] Error fetching messages:", error);
        showError("Failed to load messages.");
      } else {
        setMessages(data as Message[]);
      }
    };
    fetchMessages();
  }, [conversation.id]);

  // Effect for real-time subscriptions (messages and typing)
  useEffect(() => {
    const messageChannel = supabase
      .channel(`messages:${conversation.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          const rawNewMessage = payload.new as RawMessage;
          const senderProfile = conversation.conversation_participants.find(p => p.user_id === rawNewMessage.sender_id)?.profiles || null;
          setMessages(prev => [...prev, { ...rawNewMessage, profiles: senderProfile }]);
        }
      )
      .subscribe();

    const typingChannel = supabase
      .channel(`typing:${conversation.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'typing_status', filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;
          const record = (eventType === 'DELETE' ? oldRecord : newRecord) as { user_id: string };

          if (record.user_id === currentUser.id) return;

          const userProfile = conversation.conversation_participants.find(p => p.user_id === record.user_id)?.profiles;
          if (!userProfile) return;

          if (typingTimeoutRef.current.has(record.user_id)) {
            clearTimeout(typingTimeoutRef.current.get(record.user_id)!);
          }

          if (eventType === 'DELETE') {
            setTypingUsers(prev => prev.filter(u => u.id !== record.user_id));
            typingTimeoutRef.current.delete(record.user_id);
          } else {
            setTypingUsers(prev => {
              if (prev.some(u => u.id === userProfile.id)) return prev;
              return [...prev, userProfile];
            });

            const timeoutId = setTimeout(() => {
              setTypingUsers(prev => prev.filter(u => u.id !== record.user_id));
              typingTimeoutRef.current.delete(record.user_id);
            }, 3000);
            typingTimeoutRef.current.set(record.user_id, timeoutId);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(typingChannel);
      typingTimeoutRef.current.forEach(timeout => clearTimeout(timeout));
    };
  }, [conversation.id, conversation.conversation_participants, currentUser.id]);

  useEffect(scrollToBottom, [messages]);

  const updateTypingStatus = async () => {
    await supabase.from('typing_status').upsert({
      conversation_id: conversation.id,
      user_id: currentUser.id,
      last_typed_at: new Date().toISOString(),
    });
  };

  const removeTypingStatus = async () => {
    await supabase.from('typing_status').delete().match({
      conversation_id: conversation.id,
      user_id: currentUser.id,
    });
  };

  const debouncedUpdateTyping = useDebouncedCallback(updateTypingStatus, 500);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessageContent(e.target.value);
    debouncedUpdateTyping();
  };

  const handleSend = () => {
    if (newMessageContent.trim()) {
      onSendMessage(newMessageContent);
      setNewMessageContent("");
      debouncedUpdateTyping.cancel();
      removeTypingStatus();
    }
  };

  const handleDeleteConversation = async () => {
    const { error } = await supabase.from('conversations').delete().eq('id', conversation.id);
    if (error) {
      showError("Failed to delete conversation.");
    } else {
      showSuccess("Conversation deleted.");
      onConversationDeleted(conversation.id);
    }
  };

  const getConversationTitle = () => {
    if (conversation.name) return conversation.name;
    const other = conversation.conversation_participants.find(p => p.user_id !== currentUser.id)?.profiles;
    return `${other?.first_name || ""} ${other?.last_name || ""}`.trim() || "Chat";
  };

  const getConversationAvatar = () => {
    if (conversation.name) return `https://api.dicebear.com/7.x/lorelei/svg?seed=${conversation.name}`;
    const other = conversation.conversation_participants.find(p => p.user_id !== currentUser.id)?.profiles;
    return other?.avatar_url || `https://api.dicebear.com/7.x/lorelei/svg?seed=${other?.first_name || "User"}`;
  };

  const handleStartCall = () => {
    const participantIds = conversation.conversation_participants.map(p => p.user_id);
    startCall(conversation.id, participantIds);
  };

  const renderTypingIndicator = () => {
    if (typingUsers.length === 0) return null;
    const names = typingUsers.map(u => u.first_name).join(', ');
    return (
      <div className="px-4 pb-2 text-sm text-muted-foreground animate-pulse h-5">
        {names} {typingUsers.length > 1 ? 'are' : 'is'} typing...
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 text-foreground">
      <div className="flex items-center justify-between p-4 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex items-center gap-3">
          {onCloseChat && (
            <Button variant="ghost" size="icon" onClick={onCloseChat} className="mr-2">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <Avatar className="h-10 w-10">
            <AvatarImage src={getConversationAvatar()} />
            <AvatarFallback>{getConversationTitle().charAt(0)}</AvatarFallback>
          </Avatar>
          <h3 className="text-xl font-semibold">{getConversationTitle()}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleStartCall} disabled={!!activeCall}>
            <PhoneCall className="h-5 w-5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="hover:text-red-500">
                <Trash2 className="h-5 w-5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Conversation?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone and will delete the conversation for everyone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteConversation} className="bg-destructive hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4 bg-gray-50 dark:bg-gray-900">
        <div className="space-y-4">
          {messages.map(message => {
            const sender = message.profiles || conversation.conversation_participants.find(p => p.user_id === message.sender_id)?.profiles;
            const isCurrentUser = message.sender_id === currentUser.id;
            return (
              <div key={message.id} className={cn("flex items-end gap-2", isCurrentUser ? "justify-end" : "justify-start")}>
                {!isCurrentUser && (
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={sender?.avatar_url || `https://api.dicebear.com/7.x/lorelei/svg?seed=${sender?.first_name || "U"}`} />
                    <AvatarFallback>{sender?.first_name?.charAt(0) || "U"}</AvatarFallback>
                  </Avatar>
                )}
                <div className={cn("max-w-[75%] p-3 rounded-xl", isCurrentUser ? "bg-blue-500 text-white rounded-br-none" : "bg-gray-200 dark:bg-gray-700 rounded-bl-none")}>
                  <p className="text-base">{message.content}</p>
                  <p className="text-xs text-right mt-1 opacity-80">{format(new Date(message.created_at), 'HH:mm')}</p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {renderTypingIndicator()}

      <div className="p-4 border-t flex items-center gap-2 bg-gray-100 dark:bg-gray-800">
        <Input
          placeholder="Type your message..."
          value={newMessageContent}
          onChange={handleInputChange}
          onKeyPress={(e) => e.key === "Enter" && handleSend()}
          className="flex-1 rounded-full"
        />
        <Button onClick={handleSend} disabled={!newMessageContent.trim()} className="rounded-full h-10 w-10 p-0">
          <Send className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};