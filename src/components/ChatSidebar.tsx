"use client";

import React from "react";
import { User } from "@supabase/supabase-js";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { SupabaseConversation } from "@/components/ChatApp";
import { PlusCircle, LogOut, UserPlus, X } from "lucide-react"; // Import LogOut, UserPlus, X icons
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
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { showError, showSuccess } from "@/utils/toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "./Spinner"; // Import Spinner

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

// Define a Profile type for search results
interface SearchProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
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
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchProfile[]>([]);
  const [selectedNewChatParticipants, setSelectedNewChatParticipants] = useState<SearchProfile[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  // Debounce search term
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchTerm.trim()) {
        handleSearchUsers(searchTerm);
      } else {
        setSearchResults([]);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const handleSearchUsers = useCallback(async (term: string) => {
    if (!term.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearchingUsers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`)
        .neq('id', currentUser.id); // Exclude current user from search results

      if (error) {
        console.error("[ChatSidebar] Error searching users:", error);
        showError("Failed to search users.");
        setSearchResults([]);
      } else {
        setSearchResults(data || []);
      }
    } catch (error: any) {
      console.error("[ChatSidebar] Error searching users:", error);
      showError(`Failed to search users: ${error.message || "Unknown error"}`);
    } finally {
      setIsSearchingUsers(false);
    }
  }, [currentUser.id]);

  const handleAddParticipantToNewChat = (profile: SearchProfile) => {
    if (!selectedNewChatParticipants.some(p => p.id === profile.id)) {
      setSelectedNewChatParticipants(prev => [...prev, profile]);
      setSearchTerm(""); // Clear search term after adding
      setSearchResults([]); // Clear search results
    }
  };

  const handleRemoveParticipantFromNewChat = (profileId: string) => {
    setSelectedNewChatParticipants(prev => prev.filter(p => p.id !== profileId));
  };

  const handleCreateNewChat = async () => {
    setIsCreatingChat(true);
    try {
      const participantsToInclude = [
        currentUser,
        ...selectedNewChatParticipants.map(p => ({ id: p.id }))
      ];

      if (participantsToInclude.length < 2) {
        showError("Please select at least one other participant.");
        return;
      }

      // 1. Create the conversation
      const { data: conversationData, error: conversationError } = await supabase
        .from('conversations')
        .insert({ name: newChatName.trim() || null }) // Allow null for 1-on-1 chats
        .select()
        .single();

      if (conversationError) {
        throw conversationError;
      }

      const newConversationId = conversationData.id;

      // 2. Add all selected participants (including current user)
      const participantInserts = participantsToInclude.map(p => ({
        conversation_id: newConversationId,
        user_id: p.id,
      }));

      const { error: participantsError } = await supabase
        .from('conversation_participants')
        .insert(participantInserts);

      if (participantsError) {
        throw participantsError;
      }

      showSuccess("New chat created successfully!");
      setNewChatName("");
      setSearchTerm("");
      setSearchResults([]);
      setSelectedNewChatParticipants([]);
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
        <div className="flex items-center gap-2">
          <Dialog open={isNewChatDialogOpen} onOpenChange={setIsNewChatDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:text-sidebar-primary">
                <PlusCircle className="h-5 w-5" />
                <span className="sr-only">New Chat</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create New Chat</DialogTitle>
                <DialogDescription>
                  Start a new conversation with one or more users.
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
                    placeholder="e.g., Team Project Discussion (for group chats)"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="searchUsers" className="text-right">
                    Add Participants
                  </Label>
                  <div className="col-span-3">
                    <Input
                      id="searchUsers"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search by name..."
                      className="mb-2"
                    />
                    {isSearchingUsers && <Spinner size="sm" className="ml-2" />}
                    {searchResults.length > 0 && (
                      <ScrollArea className="h-[100px] w-full rounded-md border p-2 mb-2">
                        {searchResults.map((profile) => (
                          <div key={profile.id} className="flex items-center justify-between py-1">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={profile.avatar_url || "/placeholder.svg"} />
                                <AvatarFallback>{profile.first_name?.charAt(0) || "U"}</AvatarFallback>
                              </Avatar>
                              <span>{`${profile.first_name || ""} ${profile.last_name || ""}`.trim()}</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAddParticipantToNewChat(profile)}
                              disabled={selectedNewChatParticipants.some(p => p.id === profile.id)}
                            >
                              <UserPlus className="h-4 w-4 mr-1" /> Add
                            </Button>
                          </div>
                        ))}
                      </ScrollArea>
                    )}
                    {selectedNewChatParticipants.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedNewChatParticipants.map(p => (
                          <Badge key={p.id} variant="secondary" className="flex items-center gap-1">
                            {`${p.first_name || ""} ${p.last_name || ""}`.trim()}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-4 w-4 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => handleRemoveParticipantFromNewChat(p.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreateNewChat} disabled={isCreatingChat || selectedNewChatParticipants.length === 0}>
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