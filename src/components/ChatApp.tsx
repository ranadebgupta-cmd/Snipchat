"use client";

import React, { useState } from "react";
import { ChatSidebar } from "./ChatSidebar";
import { ChatMessageArea } from "./ChatMessageArea";
import { Separator } from "@/components/ui/separator";

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

const initialConversations: Conversation[] = [
  {
    id: "1",
    name: "Alice",
    avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=Alice",
    messages: [
      { id: "m1", sender: "Alice", text: "Hi there!", timestamp: "10:00 AM" },
      { id: "m2", sender: "You", text: "Hello Alice!", timestamp: "10:01 AM" },
    ],
  },
  {
    id: "2",
    name: "Bob",
    avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=Bob",
    messages: [
      { id: "m3", sender: "Bob", text: "Hey, how are you?", timestamp: "10:05 AM" },
      { id: "m4", sender: "You", text: "I'm good, thanks!", timestamp: "10:06 AM" },
    ],
  },
  {
    id: "3",
    name: "Charlie",
    avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=Charlie",
    messages: [
      { id: "m5", sender: "Charlie", text: "What's up?", timestamp: "10:10 AM" },
    ],
  },
];

export const ChatApp = () => {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    initialConversations[0]?.id || null
  );

  const selectedConversation = conversations.find(
    (conv) => conv.id === selectedConversationId
  );

  const handleSendMessage = (text: string) => {
    if (selectedConversationId && text.trim()) {
      setConversations((prevConversations) =>
        prevConversations.map((conv) =>
          conv.id === selectedConversationId
            ? {
                ...conv,
                messages: [
                  ...conv.messages,
                  {
                    id: Date.now().toString(),
                    sender: "You",
                    text,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  },
                ],
              }
            : conv
        )
      );
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <div className="w-1/4 border-r border-border">
        <ChatSidebar
          conversations={conversations}
          selectedConversationId={selectedConversationId}
          onSelectConversation={setSelectedConversationId}
        />
      </div>
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <ChatMessageArea
            conversation={selectedConversation}
            onSendMessage={handleSendMessage}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Select a conversation to start chatting
          </div>
        )}
      </div>
    </div>
  );
};