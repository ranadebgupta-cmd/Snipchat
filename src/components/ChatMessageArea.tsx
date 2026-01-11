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
import { Send, Trash2, ArrowLeft } from "lucide-react"; // Import ArrowLeft
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

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  profiles: Profile | null;
}

interface ChatMessageAreaProps {
  conversation: SupabaseConversation;
  onSendMessage: (text: string) => void;
  currentUser: User;
  onConversationDeleted: (conversationId: string) => void;
  onCloseChat?: () => void; // New optional prop for closing chat (mobile back button)
}

export const ChatMessageArea = ({
  conversation,
  onSendMessage,
  currentUser,
  onConversationDeleted,
  onCloseChat, // Destructure the new prop
}: ChatMessageAreaProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessageContent, setNewMessageContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const fetchMessages = async () => {
      console.log("[ChatMessageArea] Attempting to fetch messages for conversation ID:", conversation.id);
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
        console.error("[ChatMessageArea] Error fetching messages:", error);
        showError("Failed to load messages.");
        setMessages([]); // Clear messages on error
      } else {
        console.log("[ChatMessageArea] Raw messages data received:", data);
        const processedData: Message[] = (data || []).map((msg: any) => {
          let profileData: Profile | null = null;
          if (msg.profiles) {
            if (Array.isArray(msg.profiles) && msg.profiles.length > 0) {
              profileData = msg.profiles[0];
            } else if (!Array.isArray(msg.profiles)) { // It's an object
              profileData = msg.profiles;
            }
          }
          return {
            ...msg,
            profiles: profileData,
          };
        });
        setMessages(processedData);
        console.log("[ChatMessageArea] Processed messages set:", processedData);
      }
    };

    fetchMessages();

    const channel = supabase
      .channel(`conversation:${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        async (payload) => {
          console.log('[ChatMessageArea] New message received!', payload);
          // Fetch the full message with profile data
          const { data: newMessage, error } = await supabase
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
            .eq('id', payload.new.id)
            .single();

          if (error) {
            console.error("[ChatMessageArea] Error fetching new message with profile:", error);
            showError("Failed to load new message details.");
          } else if (newMessage) {
            // Process profiles for the new message
            let newProfileData: Profile | null = null;
            if (newMessage.profiles) {
              if (Array.isArray(newMessage.profiles) && newMessage.profiles.length > 0) {
                newProfileData = newMessage.profiles[0];
              } else if (!Array.isArray(newMessage.profiles)) {
                newProfileData = newMessage.profiles;
              }
            }
            const processedNewMessage: Message = {
              ...newMessage,
              profiles: newProfileData,
            };
            setMessages((prevMessages) => [...prevMessages, processedNewMessage]);
          }
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
    if (newMessageContent.trim()) {
      onSendMessage(newMessageContent);
      setNewMessageContent("");
    }
  };

  const handleDeleteConversation = async () => {
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversation.id);

    if (error) {
      console.error("Error deleting conversation:", error);
      showError("Failed to delete conversation.");
    } else {
      showSuccess("Conversation deleted successfully!");
      onConversationDeleted(conversation.id);
    }
  };

  const getConversationTitle = () => {
    if (conversation.name) {
      return conversation.name;
    }
    const otherParticipants = conversation.conversation_participants.filter(
      (p) => p.user_id !== currentUser.id
    );
    if (otherParticipants.length > 0) {
      const otherUser = otherParticipants[0].profiles;
      return `${otherUser.first_name || ""} ${otherUser.last_name || ""}`.trim();
    }
    return "Unknown Chat";
  };

  const getConversationAvatar = () => {
    if (conversation.name) {
      // Placeholder for group chat avatar
      return "/placeholder.svg";
    }
    const otherParticipants = conversation.conversation_participants.filter(
      (p) => p.user_id !== currentUser.id
    );
    if (otherParticipants.length > 0) {
      return otherParticipants[0].profiles.avatar_url || "/placeholder.svg";
    }
    return "/placeholder.svg";
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          {onCloseChat && ( // Conditionally render back button
            <Button variant="ghost" size="icon" onClick={onCloseChat} className="text-foreground hover:bg-muted">
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">Back to conversations</span>
            </Button>
          )}
          <Avatar className="h-9 w-9">
            <AvatarImage src={getConversationAvatar()} alt={getConversationTitle()} />
            <AvatarFallback>{getConversationTitle().charAt(0)}</AvatarFallback>
          </Avatar>
          <h3 className="text-lg font-semibold">{getConversationTitle()}</h3>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive/80">
              <Trash2 className="h-5 w-5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete this conversation
                for all participants and remove its data from our servers.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConversation} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 ? (
            <p className="text-center text-muted-foreground">No messages yet. Start the conversation!</p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex items-end gap-3",
                  message.sender_id === currentUser.id ? "justify-end" : "justify-start"
                )}
              >
                {message.sender_id !== currentUser.id && (
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={message.profiles?.avatar_url || "/placeholder.svg"} alt={message.profiles?.first_name || "User"} />
                    <AvatarFallback>{message.profiles?.first_name?.charAt(0) || "U"}</AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={cn(
                    "max-w-[70%] p-3 rounded-lg",
                    message.sender_id === currentUser.id
                      ? "bg-primary text-primary-foreground rounded-br-none"
                      : "bg-muted text-muted-foreground rounded-bl-none"
                  )}
                >
                  <p className="text-sm font-medium mb-1">
                    {message.sender_id === currentUser.id ? "You" : message.profiles?.first_name || "Unknown"}
                  </p>
                  <p className="text-base">{message.content}</p>
                  <p className="text-xs text-right mt-1 opacity-70">
                    {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {message.sender_id === currentUser.id && (
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={message.profiles?.avatar_url || "/placeholder.svg"} alt={message.profiles?.first_name || "You"} />
                    <AvatarFallback>{message.profiles?.first_name?.charAt(0) || "Y"}</AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="p-4 border-t flex items-center gap-2">
        <Input
          placeholder="Type your message..."
          value={newMessageContent}
          onChange={(e) => setNewMessageContent(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              handleSend();
            }
          }}
          className="flex-1"
        />
        <Button onClick={handleSend} disabled={!newMessageContent.trim()}>
          <Send className="h-5 w-5" />
          <span className="sr-only">Send message</span>
        </Button>
      </div>
    </div>
  );
};