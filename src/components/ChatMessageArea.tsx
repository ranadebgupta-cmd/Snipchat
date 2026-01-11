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
import { Send, Trash2, PhoneCall } from "lucide-react"; // Import PhoneCall icon
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
import { useCall } from './CallProvider'; // Import useCall hook

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
}

export const ChatMessageArea = ({
  conversation,
  onSendMessage,
  currentUser,
  onConversationDeleted,
}: ChatMessageAreaProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessageContent, setNewMessageContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { startCall, activeCall } = useCall(); // Use the useCall hook

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
      return "/placeholder.svg"; // Placeholder for group chat
    }
    const otherParticipants = conversation.conversation_participants.filter(
      (p) => p.user_id !== currentUser.id
    );
    if (otherParticipants.length > 0) {
      return otherParticipants[0].profiles.avatar_url || "/placeholder.svg";
    }
    return "/placeholder.svg";
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

  const handleStartCall = () => {
    if (!currentUser) {
      showError("You must be logged in to start a call.");
      return;
    }
    const participantIds = conversation.conversation_participants.map(p => p.user_id);
    startCall(conversation.id, participantIds);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 text-foreground shadow-lg rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-md">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border-2 border-white">
            <AvatarImage src={getConversationAvatar()} alt={getConversationTitle()} />
            <AvatarFallback className="bg-white text-blue-600 font-bold">{getConversationTitle().charAt(0)}</AvatarFallback>
          </Avatar>
          <h3 className="text-xl font-bold">{getConversationTitle()}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={handleStartCall}
            disabled={!!activeCall} // Disable if a call is already active
          >
            <PhoneCall className="h-5 w-5" />
            <span className="sr-only">Start Call</span>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
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
      </div>

      <ScrollArea className="flex-1 p-4 bg-gray-50 dark:bg-gray-900">
        <div className="space-y-4">
          {messages.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-lg">No messages yet. Start the conversation!</p>
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
                    "max-w-[70%] p-3 rounded-2xl shadow-md relative",
                    message.sender_id === currentUser.id
                      ? "bg-blue-600 text-white rounded-br-none"
                      : "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100 rounded-bl-none"
                  )}
                >
                  <p className="text-sm font-medium mb-1">
                    {message.sender_id === currentUser.id ? "You" : message.profiles?.first_name || "Unknown"}
                  </p>
                  <p className="text-base">{message.content}</p>
                  <p className="text-xs text-right mt-1 opacity-80">
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

      <div className="p-4 border-t flex items-center gap-2 bg-white dark:bg-gray-800 shadow-inner">
        <Input
          placeholder="Type your message..."
          value={newMessageContent}
          onChange={(e) => setNewMessageContent(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              handleSend();
            }
          }}
          className="flex-1 border-primary/30 focus:border-primary focus:ring-primary"
        />
        <Button onClick={handleSend} disabled={!newMessageContent.trim()} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Send className="h-5 w-5" />
          <span className="sr-only">Send message</span>
        </Button>
      </div>
    </div>
  );
};