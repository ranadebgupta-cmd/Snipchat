"use client";

import React, { useState, useEffect, useRef } from "react";
import { User } from "@supabase/supabase-js";
import { SupabaseConversation } from "./ChatApp";
import { supabase } from "@/integrations/supabase/client";
import { showError, showSuccess } from "@/utils/toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Send, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
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

interface ChatMessageAreaProps {
  conversation: SupabaseConversation;
  onSendMessage: (text: string) => void;
  currentUser: User;
  onConversationDeleted: (conversationId: string) => void;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  profiles: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
}

export const ChatMessageArea = ({
  conversation,
  onSendMessage,
  currentUser,
  onConversationDeleted,
}: ChatMessageAreaProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const getDisplayName = (participantId: string) => {
    const participant = conversation.conversation_participants.find(
      (p) => p.user_id === participantId
    );
    return `${participant?.profiles?.first_name || ""} ${participant?.profiles?.last_name || ""}`.trim() || "Unknown";
  };

  const getDisplayAvatar = (participantId: string) => {
    const participant = conversation.conversation_participants.find(
      (p) => p.user_id === participantId
    );
    return participant?.profiles?.avatar_url || "/placeholder.svg";
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
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
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("[ChatMessageArea] Error fetching messages:", error);
        showError("Failed to load messages.");
      } else {
        // Explicitly map the data to ensure correct typing for 'profiles'
        const typedMessages: Message[] = (data || []).map((item: any) => ({
          id: item.id,
          conversation_id: item.conversation_id,
          sender_id: item.sender_id,
          content: item.content,
          created_at: item.created_at,
          // Ensure profiles is treated as a single object, not an array
          profiles: item.profiles && Array.isArray(item.profiles) ? item.profiles[0] : item.profiles,
        }));
        setMessages(typedMessages);
      }
    };

    fetchMessages();

    const channel = supabase
      .channel(`conversation:${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          console.log("[ChatMessageArea] New message received:", payload);
          // Fetch the profile data for the new message sender
          const senderProfile = conversation.conversation_participants.find(
            (p) => p.user_id === (payload.new as Message).sender_id
          )?.profiles;

          setMessages((prevMessages) => [
            ...prevMessages,
            { ...payload.new as Message, profiles: senderProfile || null },
          ]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          console.log("[ChatMessageArea] Message deleted:", payload);
          setMessages((prevMessages) =>
            prevMessages.filter((msg) => msg.id !== (payload.old as Message).id)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation.id, conversation.conversation_participants]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (newMessage.trim()) {
      onSendMessage(newMessage);
      setNewMessage("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSend();
    }
  };

  const handleDeleteConversation = async () => {
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversation.id);

    if (error) {
      console.error("[ChatMessageArea] Error deleting conversation:", error);
      showError("Failed to delete conversation.");
    } else {
      showSuccess("Conversation deleted successfully!");
      onConversationDeleted(conversation.id);
    }
  };

  const chatTitle = conversation.name ||
    conversation.conversation_participants
      .filter((p) => p.user_id !== currentUser.id)
      .map((p) => `${p.profiles?.first_name || ""} ${p.profiles?.last_name || ""}`.trim())
      .join(", ") || "Direct Message";

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-xl font-semibold">{chatTitle}</h2>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="icon">
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete this
                conversation and all its messages for all participants.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConversation}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <ScrollArea className="flex-1 p-4 space-y-4">
        {messages.map((msg) => {
          const isCurrentUser = msg.sender_id === currentUser.id;
          return (
            <div
              key={msg.id}
              className={cn(
                "flex items-start gap-3",
                isCurrentUser ? "justify-end" : "justify-start"
              )}
            >
              {!isCurrentUser && (
                <Avatar className="h-8 w-8">
                  <AvatarImage src={getDisplayAvatar(msg.sender_id)} alt={getDisplayName(msg.sender_id)} />
                  <AvatarFallback>{getDisplayName(msg.sender_id).charAt(0)}</AvatarFallback>
                </Avatar>
              )}
              <div
                className={cn(
                  "max-w-[70%] p-3 rounded-lg",
                  isCurrentUser
                    ? "bg-primary text-primary-foreground rounded-br-none"
                    : "bg-muted text-muted-foreground rounded-bl-none"
                )}
              >
                <p className="font-medium text-sm mb-1">
                  {isCurrentUser ? "You" : getDisplayName(msg.sender_id)}
                </p>
                <p>{msg.content}</p>
                <p className="text-xs text-right mt-1 opacity-70">
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              {isCurrentUser && (
                <Avatar className="h-8 w-8">
                  <AvatarImage src={getDisplayAvatar(msg.sender_id)} alt={getDisplayName(msg.sender_id)} />
                  <AvatarFallback>{getDisplayName(msg.sender_id).charAt(0)}</AvatarFallback>
                </Avatar>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </ScrollArea>
      <div className="p-4 border-t flex items-center gap-2">
        <Input
          placeholder="Type your message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1"
        />
        <Button onClick={handleSend} disabled={!newMessage.trim()}>
          <Send className="h-5 w-5" />
          <span className="sr-only">Send message</span>
        </Button>
      </div>
    </div>
  );
};