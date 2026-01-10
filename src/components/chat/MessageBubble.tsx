"use client";

import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CheckCheck, Trash2 } from "lucide-react";
import { User } from "@supabase/supabase-js";
import { SupabaseMessage } from "@/hooks/use-chat-messages"; // Adjust import path if needed
import { SupabaseConversation } from "../ChatApp"; // Adjust import path if needed

interface MessageBubbleProps {
  message: SupabaseMessage;
  currentUser: User;
  conversationParticipants: SupabaseConversation['conversation_participants'];
  onDeleteClick: (messageId: string) => void;
}

export const MessageBubble = ({
  message,
  currentUser,
  conversationParticipants,
  onDeleteClick,
}: MessageBubbleProps) => {
  const senderProfile = message.profiles || { id: message.sender_id, first_name: "User", last_name: "", avatar_url: `https://api.dicebear.com/7.x/lorelei/svg?seed=User` };
  const senderName = senderProfile?.first_name || "Unknown";
  const senderAvatar = senderProfile?.avatar_url || `https://api.dicebear.com/7.x/lorelei/svg?seed=${senderName}`;

  const isMessageSeenByAllOthers = (msg: SupabaseMessage) => {
    if (msg.sender_id !== currentUser.id || !msg.message_receipts) return false;

    const otherParticipants = conversationParticipants.filter(p => p.user_id !== currentUser.id);
    if (otherParticipants.length === 0) return false;

    return otherParticipants.every(otherP =>
      msg.message_receipts?.some(receipt => receipt.user_id === otherP.user_id)
    );
  };

  const seenByAll = isMessageSeenByAllOthers(message);

  return (
    <div
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
              ? "bg-blue-600 text-white rounded-br-none"
              : "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100 rounded-bl-none"
          } shadow-md`}
        >
          <p className="text-sm">{message.content}</p>
          <div className="flex items-center justify-end text-xs opacity-75 mt-1">
            <span>
              {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            {message.sender_id === currentUser.id && seenByAll && (
              <CheckCheck className="h-3 w-3 ml-1 text-white" />
            )}
          </div>
          {message.sender_id === currentUser.id && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-red-500 bg-white/80 hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800"
              onClick={() => onDeleteClick(message.id)}
            >
              <Trash2 className="h-3 w-3" />
              <span className="sr-only">Delete message</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};