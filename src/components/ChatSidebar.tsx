"use client";

import React from "react";
import { User } from "@supabase/supabase-js";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { SupabaseConversation } from "@/components/ChatApp";
import { PlusCircle, LogOut, UserPlus, X, User as UserIcon, Search } from "lucide-react"; // Import Search icon
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
import { Spinner } from "./Spinner";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNowStrict } from 'date-fns'; // Import date-fns for relative time

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
      return "https://api.dicebear.com/7.x/lorelei/svg?seed=GroupChat"; // Placeholder for group chat avatar
    }
    if (otherParticipants.length > 0) {
      return otherParticipants[0].profiles.avatar_url || `https://api.dicebear.com/7.x/lorelei/svg?seed=${otherParticipants[0].profiles.first_name || "User"}`;
    }
    return "/placeholder.svg";
  };

  const displayLatestMessage = () => {
    if (!conversation.latest_message_content) {
      return "No messages yet.";
    }

    const latestMessageContent = conversation.latest_message_content;
    const latestMessageSenderId = conversation.latest_message_sender_id;

    const latestMessageSender = conversation.conversation_participants.find(
      (p) => p.user_id === latestMessageSenderId
    );

    const senderFirstName = latestMessageSender?.profiles?.first_name || "Unknown";
    
    const truncatedContent = latestMessageContent.length > 30
      ? latestMessageContent.substring(0, 27) + "..."
      : latestMessageContent;

    return `${senderFirstName === currentUser.user_metadata.first_name ? "You" : senderFirstName}: ${truncatedContent}`;
  };

  const getRelativeTime = (timestamp: string | null) => {
    if (!timestamp) return "";
    return formatDistanceToNowStrict(new Date(timestamp), { addSuffix: false });
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200 ease-in-out border-b border-gray-100 dark:border-gray-700",
        isSelected
          ? "bg-blue-50 dark:bg-gray-700"
          : "hover:bg-gray-50 dark:hover:bg-gray-800"
      )}
      onClick={() => onSelect(conversation.id)}
    >
      <Avatar className="h-12 w-12 border-2 border-gray-200 dark:border-gray-600">
        <AvatarImage src={getDisplayAvatar()} alt={getDisplayName()} />
        <AvatarFallback className="bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100">
          {getDisplayName().charAt(0)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 overflow-hidden">
        <div className="flex justify-between items-center">
          <p className="font-semibold text-lg truncate">{getDisplayName()}</p>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {getRelativeTime(conversation.latest_message_created_at)}
          </span>
        </div>
        <p
          className="text-sm text-gray-600 dark:text-gray-400 truncate"
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
  const navigate = useNavigate();

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
        .neq('id', currentUser.id);

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

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchTerm.trim()) {
        handleSearchUsers(searchTerm);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, handleSearchUsers]);

  const handleAddParticipantToNewChat = (profile: SearchProfile) => {
    if (!selectedNewChatParticipants.some(p => p.id === profile.id)) {
      setSelectedNewChatParticipants(prev => [...prev, profile]);
      setSearchTerm("");
      setSearchResults([]);
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

      const { data: conversationData, error: conversationError } = await supabase
        .from('conversations')
        .insert({ name: newChatName.trim() || null })
        .select()
        .single();

      if (conversationError) {
        throw conversationError;
      }

      const newConversationId = conversationData.id;

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
      onSelectConversation(newConversationId);
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

  const handleEditProfile = () => {
    navigate('/profile');
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-foreground border-r border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border-2 border-blue-500">
            <AvatarImage src={currentUser.user_metadata.avatar_url || "/placeholder.svg"} alt={currentUser.user_metadata.first_name || "You"} />
            <AvatarFallback className="bg-blue-500 text-white">
              {currentUser.user_metadata.first_name?.charAt(0) || "Y"}
            </AvatarFallback>
          </Avatar>
          <span className="font-semibold text-lg text-gray-800 dark:text-gray-100">
            {currentUser.user_metadata.first_name || "You"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={isNewChatDialogOpen} onOpenChange={setIsNewChatDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-gray-600 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400">
                <PlusCircle className="h-5 w-5" />
                <span className="sr-only">New Chat</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-card dark:bg-gray-800 text-card-foreground dark:text-gray-100">
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
                    className="col-span-3 bg-background dark:bg-gray-700 text-foreground dark:text-gray-100 border-border dark:border-gray-600"
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
                      className="mb-2 bg-background dark:bg-gray-700 text-foreground dark:text-gray-100 border-border dark:border-gray-600"
                    />
                    {isSearchingUsers && <Spinner size="sm" className="ml-2" />}
                    {searchResults.length > 0 && (
                      <ScrollArea className="h-[100px] w-full rounded-md border p-2 mb-2 bg-background dark:bg-gray-700 border-border dark:border-gray-600">
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
                              className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
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
                          <Badge key={p.id} variant="secondary" className="flex items-center gap-1 bg-secondary dark:bg-gray-600 text-secondary-foreground dark:text-gray-100">
                            {`${p.first_name || ""} ${p.last_name || ""}`.trim()}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-4 w-4 p-0 text-muted-foreground hover:text-foreground dark:hover:text-gray-50"
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
                <Button onClick={handleCreateNewChat} disabled={isCreatingChat || selectedNewChatParticipants.length === 0} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  {isCreatingChat ? "Creating..." : "Create Chat"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="ghost" size="icon" onClick={handleEditProfile} className="text-gray-600 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400">
            <UserIcon className="h-5 w-5" />
            <span className="sr-only">Edit Profile</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-gray-600 hover:text-red-500 dark:text-gray-300 dark:hover:text-red-400">
            <LogOut className="h-5 w-5" />
            <span className="sr-only">Logout</span>
          </Button>
        </div>
      </div>

      {/* Search Conversations */}
      <div className="p-3 border-b border-gray-100 dark:border-gray-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400" />
          <Input
            placeholder="Search chats..."
            className="pl-10 w-full rounded-full bg-gray-100 dark:bg-gray-800 border-none focus:ring-blue-500 focus:ring-1"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Conversation List */}
      <ScrollArea className="flex-1">
        <div className="space-y-0"> {/* Removed space-y-1 to make items closer */}
          {conversations.length === 0 ? (
            <p className="p-4 text-muted-foreground dark:text-gray-400 text-center">No conversations yet. Click '+' to start one!</p>
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