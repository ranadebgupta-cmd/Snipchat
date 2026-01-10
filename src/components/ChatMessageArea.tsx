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

      <ScrollArea className="flex-1 p-4 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
        {isLoadingMessages ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <Spinner size="md" />
            <p className="ml-2">Loading messages...</p>
          </div>
        ) : (
          <div className="space-y-4">
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