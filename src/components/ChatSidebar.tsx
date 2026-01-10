"use client";

import React, { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Plus, User as UserIcon } from "lucide-react"; // Import User icon
import { SupabaseConversation } from "./ChatApp";
import { NewConversationDialog } from "./NewConversationDialog";
import { UserProfileDialog } from "./UserProfileDialog"; // Import the new dialog

interface ChatSidebarProps {
  conversations: SupabaseConversation[];
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
  currentUser: User;
}

export const ChatSidebar = ({
  conversations,
  selectedConversationId,
  onSelectConversation,
  currentUser,
}: ChatSidebarProps) => {
  const [isNewChatDialogOpen, setIsNewChatDialogOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false); // State for profile dialog

  const getConversationDisplayName = (conversation: SupabaseConversation) => {
    if (conversation.name) {
      return conversation.name;
    }
    const otherParticipant = conversation.conversation_participants.find(
      (p) => p.user_id !== currentUser.id
    );
    if (otherParticipant && otherParticipant.profiles) {
      return `${otherParticipant.profiles.first_name || ''} ${otherParticipant.profiles.last_name || ''}`.trim() || "Unknown User";
    }
    return "New Chat";
  };

  const getConversationDisplayAvatar = (conversation: SupabaseConversation) => {
    if (conversation.name) {
      return "https://api.dicebear.com/7.x/lorelei/svg?seed=GroupChat";
    }
    const otherParticipant = conversation.conversation_participants.find(
      (p) => p.user_id !== currentUser.id
    );
    return otherParticipant?.profiles?.avatar_url || `https://api.dicebear.com/7.x/lorelei/svg?seed=${otherParticipant?.profiles?.first_name || 'User'}`;
  };

  const handleNewConversationCreated = (conversationId: string) => {
    onSelectConversation(conversationId);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border flex justify-between items-center">
        <h2 className="text-xl font-semibold">Chats</h2>
        <div className="flex space-x-2">
          <Button variant="ghost" size="icon" onClick={() => setIsProfileDialogOpen(true)}>
            <UserIcon className="h-5 w-5" />
            <span className="sr-only">View Profile</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setIsNewChatDialogOpen(true)}>
            <Plus className="h-5 w-5" />
            <span className="sr-only">Start new chat</span>
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        {conversations.length === 0 ? (
          <div className="p-4 text-muted-foreground text-center">No conversations yet. Click '+' to start one.</div>
        ) : (
          conversations.map((conversation) => {
            const latestMessage = conversation.messages[0];
            const displayName = getConversationDisplayName(conversation);
            const displayAvatar = getConversationDisplayAvatar(conversation);

            return (
              <div
                key={conversation.id}
                className={cn(
                  "flex items-center p-4 cursor-pointer hover:bg-accent",
                  selectedConversationId === conversation.id && "bg-accent"
                )}
                onClick={() => onSelectConversation(conversation.id)}
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={displayAvatar} alt={displayName} />
                  <AvatarFallback>{displayName.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="ml-3 flex-1">
                  <p className="font-medium">{displayName}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {latestMessage?.content || "No messages yet"}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {latestMessage?.created_at ? new Date(latestMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </p>
              </div>
            );
          })
        )}
      </ScrollArea>
      <NewConversationDialog
        isOpen={isNewChatDialogOpen}
        onClose={() => setIsNewChatDialogOpen(false)}
        onConversationCreated={handleNewConversationCreated}
      />
      <UserProfileDialog
        isOpen={isProfileDialogOpen}
        onClose={() => setIsProfileDialogOpen(false)}
      />
    </div>
  );
};