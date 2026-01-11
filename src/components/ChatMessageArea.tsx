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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { startCall, activeCall } = useCall();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    console.log("[ChatMessageArea] Component mounted or conversation changed. Conversation ID:", conversation.id);

    const fetchMessages = async () => {
      console.log("[ChatMessageArea] Fetching initial messages for conversation ID:", conversation.id);
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
        setMessages([]);
      } else {
        const processedData: Message[] = (data || []).map((msg: any) => {
          let profileData: Profile | null = null;
          if (msg.profiles) {
            if (Array.isArray(msg.profiles) && msg.profiles.length > 0) {
              profileData = msg.profiles[0];
            } else if (!Array.isArray(msg.profiles)) {
              profileData = msg.profiles;
            }
          }
          return {
            ...msg,
            profiles: profileData,
          };
        });
        setMessages(processedData);
        console.log("[ChatMessageArea] Initial messages loaded:", processedData);
      }
    };

    fetchMessages();

    console.log(`[ChatMessageArea] Subscribing to real-time changes for conversation:${conversation.id}`);
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
        (payload) => {
          console.log('[ChatMessageArea] Real-time new message payload received:', payload);

          const newMessageData = payload.new as Message; 

          // Find the sender's profile from the current conversation's participants
          const senderProfile = conversation.conversation_participants.find(
            (p) => p.user_id === newMessageData.sender_id
          )?.profiles;

          const processedNewMessage: Message = {
            ...newMessageData,
            profiles: senderProfile || null, 
          };

          setMessages((prevMessages) => {
            const updatedMessages = [...prevMessages, processedNewMessage];
            console.log('[ChatMessageArea] Messages state updated via real-time:', updatedMessages);
            return updatedMessages;
          });
        }
      )
      .subscribe();

    return () => {
      console.log(`[ChatMessageArea] Unsubscribing from conversation:${conversation.id}`);
      supabase.removeChannel(channel);
    };
  }, [conversation.id, conversation.conversation_participants]); // Added conversation.conversation_participants to dependencies

  useEffect(() => {
    console.log("[ChatMessageArea] Messages state updated, scrolling to bottom.");
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (newMessageContent.trim()) {
      console.log("[ChatMessageArea] Sending message:", newMessageContent);
      onSendMessage(newMessageContent);
      setNewMessageContent("");
    }
  };

  const handleDeleteConversation = async () => {
    console.log("[ChatMessageArea] Attempting to delete conversation:", conversation.id);
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
      console.log("[ChatMessageArea] Conversation deleted successfully.");
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
      return "https://api.dicebear.com/7.x/lorelei/svg?seed=GroupChat";
    }
    const otherParticipants = conversation.conversation_participants.filter(
      (p) => p.user_id !== currentUser.id
    );
    if (otherParticipants.length > 0) {
      return otherParticipants[0].profiles.avatar_url || `https://api.dicebear.com/7.x/lorelei/svg?seed=${otherParticipants[0].profiles.first_name || "User"}`;
    }
    return "/placeholder.svg";
  };

  const handleStartCall = () => {
    if (!currentUser) {
      showError("You must be logged in to start a call.");
      return;
    }
    const participantIds = conversation.conversation_participants.map(p => p.user_id);
    console.log("[ChatMessageArea] Starting call for conversation:", conversation.id, "with participants:", participantIds);
    startCall(conversation.id, participantIds);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex items-center gap-3">
          {onCloseChat && ( // Show back button only if onCloseChat is provided (i.e., on mobile)
            <Button variant="ghost" size="icon" onClick={onCloseChat} className="text-gray-600 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400">
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">Back to chats</span>
            </Button>
          )}
          <Avatar className="h-10 w-10 border-2 border-gray-200 dark:border-gray-600">
            <AvatarImage src={getConversationAvatar()} alt={getConversationTitle()} />
            <AvatarFallback className="bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100">
              {getConversationTitle().charAt(0)}
            </AvatarFallback>
          </Avatar>
          <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">{getConversationTitle()}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="text-gray-600 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400" onClick={handleStartCall} disabled={!!activeCall}>
            <PhoneCall className="h-5 w-5" />
            <span className="sr-only">Start Call</span>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-gray-600 hover:text-red-500 dark:text-gray-300 dark:hover:text-red-400">
                <Trash2 className="h-5 w-5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-card dark:bg-gray-800 text-card-foreground dark:text-gray-100">
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

      {/* Message Area */}
      <ScrollArea className="flex-1 p-4 bg-gray-50 dark:bg-gray-900">
        <div className="space-y-4">
          {messages.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-lg">No messages yet. Start the conversation!</p>
          ) : (
            messages.map((message) => {
              const senderProfile = message.profiles || conversation.conversation_participants.find(p => p.user_id === message.sender_id)?.profiles;
              const senderFirstName = senderProfile?.first_name || "Unknown";
              const senderAvatar = senderProfile?.avatar_url || `https://api.dicebear.com/7.x/lorelei/svg?seed=${senderFirstName}`;
              const isCurrentUser = message.sender_id === currentUser.id;

              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex items-end gap-2",
                    isCurrentUser ? "justify-end" : "justify-start"
                  )}
                >
                  {!isCurrentUser && ( // Show avatar for other users' messages
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={senderAvatar} alt={senderFirstName} />
                      <AvatarFallback>{senderFirstName.charAt(0) || "U"}</AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={cn(
                      "max-w-[75%] p-3 rounded-xl relative",
                      isCurrentUser
                        ? "bg-blue-500 text-white rounded-br-none" // Current user's message
                        : "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100 rounded-bl-none" // Other user's message
                    )}
                  >
                    <p className="text-base">{message.content}</p>
                    <p className="text-xs text-right mt-1 opacity-80">
                      {format(new Date(message.created_at), 'HH:mm')}
                    </p>
                  </div>
                </div>
              );
            }))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Message Input */}
      <div className="p-4 border-t flex items-center gap-2 bg-gray-100 dark:bg-gray-800 shadow-inner">
        <Input
          placeholder="Type your message..."
          value={newMessageContent}
          onChange={(e) => setNewMessageContent(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              handleSend();
            }
          }}
          className="flex-1 rounded-full bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500"
        />
        <Button onClick={handleSend} disabled={!newMessageContent.trim()} className="rounded-full h-10 w-10 p-0 bg-blue-600 hover:bg-blue-700 text-white">
          <Send className="h-5 w-5" />
          <span className="sr-only">Send message</span>
        </Button>
      </div>
    </div>
  );
};