"use client";

import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
}

interface Conversation {
  id: string;
  name: string;
  messages: Message[];
  avatar: string;
}

interface ChatSidebarProps {
  conversations: Conversation[];
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
}

export const ChatSidebar = ({
  conversations,
  selectedConversationId,
  onSelectConversation,
}: ChatSidebarProps) => {
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border">
        <h2 className="text-xl font-semibold">Chats</h2>
      </div>
      <ScrollArea className="flex-1">
        {conversations.map((conversation) => (
          <div
            key={conversation.id}
            className={cn(
              "flex items-center p-4 cursor-pointer hover:bg-accent",
              selectedConversationId === conversation.id && "bg-accent"
            )}
            onClick={() => onSelectConversation(conversation.id)}
          >
            <Avatar className="h-10 w-10">
              <AvatarImage src={conversation.avatar} alt={conversation.name} />
              <AvatarFallback>{conversation.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="ml-3 flex-1">
              <p className="font-medium">{conversation.name}</p>
              <p className="text-sm text-muted-foreground truncate">
                {conversation.messages[conversation.messages.length - 1]?.text || "No messages yet"}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {conversation.messages[conversation.messages.length - 1]?.timestamp}
            </p>
          </div>
        ))}
      </ScrollArea>
    </div>
  );
};