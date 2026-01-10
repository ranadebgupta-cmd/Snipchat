"use client";

import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { User } from "@supabase/supabase-js";
import { SupabaseConversation } from "../ChatApp"; // Adjust import path if needed

interface ChatHeaderProps {
  conversation: SupabaseConversation;
  currentUser: User;
  messagesLength: number;
  onDeleteConversation: () => void;
  onOpenDeleteDialog: () => void;
}

export const ChatHeader = ({
  conversation,
  currentUser,
  messagesLength,
  onOpenDeleteDialog,
}: ChatHeaderProps) => {
  const getOtherParticipantProfile = () => {
    return conversation.conversation_participants.find(p => p.user_id !== currentUser.id)?.profiles;
  };

  const displayName = conversation.name || `${getOtherParticipantProfile()?.first_name || ''} ${getOtherParticipantProfile()?.last_name || ''}`.trim() || "Unknown Chat";
  const displayAvatar = conversation.name ? "https://api.dicebear.com/7.x/lorelei/svg?seed=GroupChat" : getOtherParticipantProfile()?.avatar_url || `https://api.dicebear.com/7.x/lorelei/svg?seed=${getOtherParticipantProfile()?.first_name || 'User'}`;

  // Determine if the conversation is 'blank' for deletion purposes
  const isBlankConversation = !conversation.name && messagesLength === 0;

  return (
    <div className="flex items-center p-4 border-b border-border bg-card text-card-foreground shadow-sm">
      <Avatar className="h-10 w-10">
        <AvatarImage src={displayAvatar} alt={displayName} />
        <AvatarFallback>{displayName.charAt(0)}</AvatarFallback>
      </Avatar>
      <h3 className="ml-3 text-lg font-semibold">{displayName}</h3>
      {isBlankConversation && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenDeleteDialog}
          className="ml-auto text-destructive hover:bg-destructive/10"
          title="Delete empty conversation"
        >
          <Trash2 className="h-5 w-5" />
          <span className="sr-only">Delete conversation</span>
        </Button>
      )}
    </div>
  );
};