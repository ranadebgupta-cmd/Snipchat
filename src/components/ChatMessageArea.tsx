"use client";

import React, { useState, useRef, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send } from "lucide-react";

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

interface ChatMessageAreaProps {
  conversation: Conversation;
  onSendMessage: (text: string) => void;
}

export const ChatMessageArea = ({ conversation, onSendMessage }: ChatMessageAreaProps) => {
  const [messageInput, setMessageInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation.messages]);

  const handleSend = () => {
    if (messageInput.trim()) {
      onSendMessage(messageInput);
      setMessageInput("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center p-4 border-b border-border">
        <Avatar className="h-9 w-9">
          <AvatarImage src={conversation.avatar} alt={conversation.name} />
          <AvatarFallback>{conversation.name.charAt(0)}</AvatarFallback>
        </Avatar>
        <h3 className="ml-3 text-lg font-semibold">{conversation.name}</h3>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {conversation.messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.sender === "You" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`flex items-end max-w-[70%] ${
                  message.sender === "You" ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {message.sender !== "You" && (
                  <Avatar className="h-8 w-8 mr-2">
                    <AvatarImage src={conversation.avatar} alt={conversation.name} />
                    <AvatarFallback>{conversation.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={`p-3 rounded-lg ${
                    message.sender === "You"
                      ? "bg-primary text-primary-foreground rounded-br-none"
                      : "bg-muted text-muted-foreground rounded-bl-none"
                  }`}
                >
                  <p className="text-sm">{message.text}</p>
                  <span className="text-xs opacity-75 mt-1 block text-right">
                    {message.timestamp}
                  </span>
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      <div className="p-4 border-t border-border flex items-center">
        <Input
          placeholder="Type your message..."
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyPress={handleKeyPress}
          className="flex-1 mr-2"
        />
        <Button onClick={handleSend} disabled={!messageInput.trim()}>
          <Send className="h-4 w-4" />
          <span className="sr-only">Send message</span>
        </Button>
      </div>
    </div>
  );
};