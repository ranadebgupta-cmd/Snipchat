"use client";

import React, { useState, useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { showSuccess, showError } from "@/utils/toast";
import { SupabaseConversation } from "./ChatApp";
import { Spinner } from "./Spinner";

// Import new modular components and hooks
import { useChatMessages } from "@/hooks/use-chat-messages";
import { useTypingStatus } from "@/hooks/use-typing-status";
import { ChatHeader } from "./chat/ChatHeader.tsx";
import { MessageBubble } from "./chat/MessageBubble.tsx";
import { ChatInput } from "./chat/ChatInput.tsx";
import { DeleteMessageDialog } from "./chat/DeleteMessageDialog.tsx";
import { DeleteConversationDialog } from "./chat/DeleteConversationDialog.tsx";

interface ChatMessageAreaProps {
  conversation: SupabaseConversation;
  onSendMessage: (text: string) => void;
  currentUser: User;
  onConversationDeleted: (conversationId: string) => void;
}

export const ChatMessageArea = ({ conversation, onSendMessage, currentUser, onConversationDeleted }: ChatMessageAreaProps) => {
  const [messageToDeleteId, setMessageToDeleteId] = useState<string | null>(null);
  const [showDeleteConversationDialog, setShowDeleteConversationDialog] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, isLoadingMessages, fetchMessages } = useChatMessages(conversation.id, currentUser);
  const { typingIndicatorText, handleTypingChange } = useTypingStatus(conversation.id, currentUser);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleDeleteMessageClick = (messageId: string) => {
    setMessageToDeleteId(messageId);
  };

  const confirmDeleteMessage = async () => {
    if (!messageToDeleteId) return;

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageToDeleteId);

    if (error) {
      console.error("[ChatMessageArea] Error deleting message:", error);
      showError("Failed to delete message.");
    } else {
      showSuccess("Message deleted successfully!");
      fetchMessages(); // Re-fetch messages to update the UI
    }
    setMessageToDeleteId(null);
  };

  const confirmDeleteConversation = async () => {
    if (!conversation.id) return;

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
    }
    setShowDeleteConversationDialog(false);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <ChatHeader
        conversation={conversation}
        currentUser={currentUser}
        messagesLength={messages.length}
        onDeleteConversation={confirmDeleteConversation}
        onOpenDeleteDialog={() => setShowDeleteConversationDialog(true)}
      />

      <ScrollArea 
        className="flex-1 p-4 bg-cover bg-center relative"
        style={{ backgroundImage: `url('https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D')` }}
      >
        {/* Optional: Add an overlay for better readability if needed */}
        <div className="absolute inset-0 bg-black opacity-20 dark:opacity-40"></div>
        {isLoadingMessages ? (
          <div className="relative z-10 flex items-center justify-center h-full text-white dark:text-muted-foreground">
            <Spinner size="md" className="text-white dark:text-muted-foreground" />
            <p className="ml-2">Loading messages...</p>
          </div>
        ) : (
          <div className="relative z-10 space-y-4">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                currentUser={currentUser}
                conversationParticipants={conversation.conversation_participants}
                onDeleteClick={handleDeleteMessageClick}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {typingIndicatorText && (
        <div className="p-2 text-sm text-muted-foreground bg-muted/20 dark:bg-gray-800/50 rounded-t-lg">
          {typingIndicatorText}
        </div>
      )}

      <ChatInput
        onSendMessage={onSendMessage}
        isSendingMessage={false} // This state is now managed by the parent or ChatInput itself
        onTypingChange={handleTypingChange}
      />

      <DeleteMessageDialog
        isOpen={!!messageToDeleteId}
        onClose={() => setMessageToDeleteId(null)}
        onConfirm={confirmDeleteMessage}
      />

      <DeleteConversationDialog
        isOpen={showDeleteConversationDialog}
        onClose={() => setShowDeleteConversationDialog(false)}
        onConfirm={confirmDeleteConversation}
      />
    </div>
  );
};