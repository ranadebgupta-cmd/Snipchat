"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { Spinner } from "../Spinner"; // Adjust import path if needed

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  isSendingMessage: boolean;
  onTypingChange: (isTyping: boolean) => void;
}

export const ChatInput = ({ onSendMessage, isSendingMessage, onTypingChange }: ChatInputProps) => {
  const [messageInput, setMessageInput] = useState("");

  const handleMessageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);
    onTypingChange(e.target.value.length > 0);
  };

  const handleSend = async () => {
    if (!messageInput.trim()) return;
    await onSendMessage(messageInput);
    setMessageInput("");
    onTypingChange(false); // Stop typing after sending
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && messageInput.trim() && !isSendingMessage) {
      handleSend();
    }
  };

  return (
    <div className="p-4 border-t border-border flex items-center bg-card">
      <Input
        placeholder="Type your message..."
        value={messageInput}
        onChange={handleMessageInputChange}
        onKeyPress={handleKeyPress}
        className="flex-1 mr-2 rounded-full px-4 py-2 border focus-visible:ring-primary focus-visible:ring-offset-0"
        disabled={isSendingMessage}
      />
      <Button onClick={handleSend} disabled={!messageInput.trim() || isSendingMessage} className="rounded-full p-2 h-10 w-10">
        {isSendingMessage ? <Spinner size="sm" className="text-primary-foreground" /> : <Send className="h-5 w-5" />}
        <span className="sr-only">Send message</span>
      </Button>
    </div>
  );
};