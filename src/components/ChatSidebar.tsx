"use client";

import React from "react";
import { User } from "@supabase/supabase-js";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { SupabaseConversation } from "@/components/ChatApp";
import { PlusCircle, LogOut } from "lucide-react"; // Import LogOut icon
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { showError, showSuccess } from "@/utils/toast";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatSidebarProps {
  conversations: SupabaseConversation[];
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
  currentUser: User;
}

interface ConversationItemProps {
  conversation: SupabaseConversation;
  isSelected: boolean;
  onSelect: (id: string) => void;
  currentUser: User;
}

const ConversationItem = ({
  conversation,
  isSelected,
  onSelect,
  currentUser,
}: ConversationItemProps) => {
  const otherParticipants = conversation.conversation_participants.filter(
    (p) => p.user_id !== currentUser.id
  );

  const isGroupChat = conversation.name !== null;

  const getDisplayName = () => {
    if (isGroupChat) {
      return conversation.name;
    }
    if (otherParticipants.length > 0) {
      const otherUser = otherParticipants[0].profiles;
      return `${otherUser.first_name || ""} ${otherUser.last_name || ""}`.trim();
    }
    return "Unknown Chat";
  };

  const getDisplayAvatar = () => {
    if (isGroupChat) {
      // Placeholder for group chat avatar
      return "/placeholder.svg";
    }
    if (otherParticipants.length > 0) {
      return otherParticipants[0].profiles.avatar_url || "/placeholder.svg";
    }
    return "/placeholder.svg";
  };

  const displayLatestMessage = () => {
    if (!conversation.latest_message_content) {
      return "No messages yet.";
    }

    const latestMessageSender = conversation.conversation_participants.find(
      (p) => p.user_id === conversation.latest_message_sender_id
    );

    const senderFirstName = latestMessageSender?.profiles?.first_name || "Unknown";
    
    const truncatedContent = conversation.latest_message_content.length > 30
      ? conversation.latest_message_content.substring(0, 27) + "..."
      : conversation.latest_message_content;

    return `${senderFirstName}: ${truncatedContent}`;
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
        isSelected
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted/50"
      )}
      onClick={() => onSelect(conversation.id)}
    >
      <Avatar className="h-10 w-10">
        <AvatarImage src={getDisplayAvatar()} alt={getDisplayName()} />
        <AvatarFallback>{getDisplayName().charAt(0)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 overflow-hidden">
        <p className="font-medium truncate">{getDisplayName()}</p>
        <p
          className={cn(
            "text-sm truncate",
            isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
          )}
        >
          {displayLatestMessage()}
        </p>
      </div>
    </div>
  );
};

export const ChatSidebar = ({
  conversations,
  selectedConversationId,
  onSelectConversation,
  currentUser,
}: ChatSidebarProps) => {
  const [isNewChatDialogOpen, setIsNewChatDialogOpen] = useState(false);
  const [newChatName, setNewChatName] = useState("");
  const [newChatParticipantEmail, setNewChatParticipantEmail] = useState("");
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  const handleCreateNewChat = async () => {
    setIsCreatingChat(true);
    try {
      // 1. Create the conversation
      const { data: conversationData, error: conversationError } = await supabase
        .from('conversations')
        .insert({ name: newChatName || null }) // Allow null for 1-on-1 chats
        .select()
        .single();

      if (conversationError) {
        throw conversationError;
      }

      const newConversationId = conversationData.id;

      // 2. Add current user as participant
      const { error: currentUserParticipantError } = await supabase
        .from('conversation_participants')
        .insert({ conversation_id: newConversationId, user_id: currentUser.id });

      if (currentUserParticipantError) {
        throw currentUserParticipantError;
      }

      // 3. If participant email is provided, find user and add them
      if (newChatParticipantEmail) {
        const { data: participantProfile, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', newChatParticipantEmail) // Assuming email is stored in profiles
          .single();

        if (profileError || !participantProfile) {
          throw new Error("Participant not found or error fetching profile.");
        }

        const { error: otherUserParticipantError } = await supabase
          .from('conversation_participants')
          .insert({ conversation_id: newConversationId, user_id: participantProfile.id });

        if (otherUserParticipantError) {
          throw otherUserParticipantError;
        }
      }

      showSuccess("New chat created successfully!");
      setNewChatName("");
      setNewChatParticipantEmail("");
      setIsNewChatDialogOpen(false);
      onSelectConversation(newConversationId); // Select the newly created chat
    } catch (error: any) {
      console.error("[ChatSidebar] Error creating new chat:", error);
      showError(`Failed to create chat: ${error.message || "Unknown error"}`);
    } finally {
      setIsCreatingChat(false);
    }
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
      showSuccess("You have been logged out successfully!");
    } catch (error: any) {
      console.error("[ChatSidebar] Error logging out:", error);
      showError(`Failed to log out: ${error.message || "Unknown error"}`);
    }
  };

  return (
    <div className="flex flex-col h-full border-r bg-sidebar text-sidebar-foreground">
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="text-xl font-semibold">Chats</h2>
        <div className="flex items-center gap-2"> {/* Group buttons */}
          <Dialog open={isNewChatDialogOpen} onOpenChange={setIsNewChatDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:text-sidebar-primary">
                <PlusCircle className="h-5 w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create New Chat</DialogTitle>
                <DialogDescription>
                  Start a new conversation. You can create a group chat or a 1-on-1 chat.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="chatName" className="text-right">
                    Chat Name (Optional)
                  </Label>
                  <Input
                    id="chatName"
                    value={newChatName}
                    onChange={(e) => setNewChatName(e.target.value)}
                    className="col-span-3"
                    placeholder="e.g., Team Project Discussion"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="participantEmail" className="text-right">
                    Add Participant (Email)
                  </Label>
                  <Input
                    id="participantEmail"
                    type="email"
                    value={newChatParticipantEmail}
                    onChange={(e) => setNewChatParticipantEmail(e.target.value)}
                    className="col-span-3"
                    placeholder="e.g., user@example.com"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreateNewChat} disabled={isCreatingChat}>
                  {isCreatingChat ? "Creating..." : "Create Chat"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-sidebar-foreground hover:text-destructive">
            <LogOut className="h-5 w-5" />
            <span className="sr-only">Logout</span>
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1 p-2">
        <div className="space-y-1">
          {conversations.length === 0 ? (
            <p className="p-3 text-muted-foreground text-center">No conversations yet.</p>
          ) : (
            conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isSelected={conv.id === selectedConversationId}
                onSelect={onSelectConversation}
                currentUser={currentUser}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};