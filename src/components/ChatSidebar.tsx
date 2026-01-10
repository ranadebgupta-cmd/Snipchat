"use client";

import React, { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Plus, User as UserIcon, LogOut } from "lucide-react"; // Import LogOut icon
import { SupabaseConversation } from "./ChatApp";
import { NewConversationDialog } from "./NewConversationDialog";
import { UserProfileDialog } from "./UserProfileDialog";
import { supabase } from "@/integrations/supabase/client";
import { showError, showSuccess } from "@/utils/toast";
import { Spinner } from "./Spinner"; // Import the Spinner component

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
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false); // State for logout loading

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

  const handleLogout = async () => {
    setIsLoggingOut(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error logging out:", error);
      showError("Failed to log out.");
    } else {
      showSuccess("You have been logged out.");
    }
    setIsLoggingOut(false);
  };

  return (
    <div className="h-full flex flex-col bg-sidebar text-sidebar-foreground">
      <div className="p-4 border-b border-sidebar-border flex justify-between items-center bg-sidebar-primary text-sidebar-primary-foreground">
        <h2 className="text-xl font-semibold">SnipChat</h2>
        <div className="flex space-x-2">
          <Button variant="ghost" size="icon" onClick={() => setIsProfileDialogOpen(true)} className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <UserIcon className="h-5 w-5" />
            <span className="sr-only">View Profile</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setIsNewChatDialogOpen(true)} className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <Plus className="h-5 w-5" />
            <span className="sr-only">Start new chat</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} disabled={isLoggingOut} className="hover:bg-destructive hover:text-destructive-foreground">
            {isLoggingOut ? <Spinner size="sm" className="text-destructive-foreground" /> : <LogOut className="h-5 w-5" />}
            <span className="sr-only">Log out</span>
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        {conversations.length === 0 ? (
          <div className="p-4 text-muted-foreground text-center">No conversations yet. Click '+' to start one.</div>
        ) : (
          conversations.map((conversation) => {
            const displayName = getConversationDisplayName(conversation);
            const displayAvatar = getConversationDisplayAvatar(conversation);

            return (
              <div
                key={conversation.id}
                className={cn(
                  "flex items-center p-4 cursor-pointer border-b border-sidebar-border last:border-b-0 transition-colors duration-200",
                  selectedConversationId === conversation.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent/50"
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
                    {conversation.latest_message_content || "No messages yet"}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {conversation.latest_message_created_at ? new Date(conversation.latest_message_created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
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