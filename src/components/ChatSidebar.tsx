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
      return `https://api.dicebear.com/7.x/lorelei/svg?seed=${conversation.name || "Group"}`;
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

    const { latest_message_content, latest_message_sender_id } = conversation;
    const isSenderCurrentUser = latest_message_sender_id === currentUser.id;
    const prefix = isSenderCurrentUser ? "You: " : "";
    const truncatedContent = latest_message_content.length > 25
      ? latest_message_content.substring(0, 22) + "..."
      : latest_message_content;

    if (isGroupChat && !isSenderCurrentUser) {
      const sender = conversation.conversation_participants.find(p => p.user_id === latest_message_sender_id)?.profiles;
      return `${sender?.first_name || 'Someone'}: ${truncatedContent}`;
    }

    return `${prefix}${truncatedContent}`;
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
  const [conversationSearchTerm, setConversationSearchTerm] = useState("");
  const navigate = useNavigate();

  const handleSearchUsers = useCallback(async (term: string) => {
    if (!term.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearchingUsers(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, avatar_url')
      .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`)
      .neq('id', currentUser.id);

    if (error) {
      showError("Failed to search users.");
    } else {
      setSearchResults(data || []);
    }
    setIsSearchingUsers(false);
  }, [currentUser.id]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      handleSearchUsers(searchTerm);
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, handleSearchUsers]);

  const handleAddParticipantToNewChat = (profile: SearchProfile) => {
    if (!selectedNewChatParticipants.some(p => p.id === profile.id)) {
      setSelectedNewChatParticipants(prev => [...prev, profile]);
      setSearchTerm("");
    }
  };

  const handleRemoveParticipantFromNewChat = (profileId: string) => {
    setSelectedNewChatParticipants(prev => prev.filter(p => p.id !== profileId));
  };

  const handleCreateNewChat = async () => {
    if (selectedNewChatParticipants.length === 0) {
      showError("Please select at least one other participant.");
      return;
    }
    setIsCreatingChat(true);
    try {
      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .insert({ name: newChatName.trim() || null })
        .select()
        .single();

      if (convError) throw convError;

      const participantInserts = [currentUser.id, ...selectedNewChatParticipants.map(p => p.id)].map(id => ({
        conversation_id: convData.id,
        user_id: id,
      }));

      const { error: partError } = await supabase.from('conversation_participants').insert(participantInserts);
      if (partError) throw partError;

      showSuccess("New chat created!");
      setNewChatName("");
      setSearchTerm("");
      setSelectedNewChatParticipants([]);
      setIsNewChatDialogOpen(false);
      onSelectConversation(convData.id);
    } catch (error: any) {
      showError(`Failed to create chat: ${error.message}`);
    } finally {
      setIsCreatingChat(false);
    }
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) showError(`Logout failed: ${error.message}`);
  };

  const filteredConversations = conversations.filter(conv => {
    const otherParticipants = conv.conversation_participants.filter(p => p.user_id !== currentUser.id);
    const name = conv.name || (otherParticipants[0] ? `${otherParticipants[0].profiles.first_name} ${otherParticipants[0].profiles.last_name}` : 'Chat');
    return name.toLowerCase().includes(conversationSearchTerm.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-foreground border-r border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between p-4 bg-gray-100 dark:bg-gray-800 border-b">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border-2 border-blue-500">
            <AvatarImage src={currentUser.user_metadata.avatar_url} />
            <AvatarFallback>{currentUser.user_metadata.first_name?.charAt(0) || 'U'}</AvatarFallback>
          </Avatar>
          <span className="font-semibold text-lg">{currentUser.user_metadata.first_name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={isNewChatDialogOpen} onOpenChange={setIsNewChatDialogOpen}>
            <DialogTrigger asChild><Button variant="ghost" size="icon"><PlusCircle className="h-5 w-5" /></Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create New Chat</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <Input id="chatName" value={newChatName} onChange={e => setNewChatName(e.target.value)} placeholder="Chat Name (Optional for groups)" />
                <Input id="searchUsers" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search users..." />
                {isSearchingUsers && <Spinner size="sm" />}
                {searchResults.length > 0 && (
                  <ScrollArea className="h-[100px] w-full rounded-md border p-2">
                    {searchResults.map(p => (
                      <div key={p.id} className="flex items-center justify-between py-1">
                        <span>{p.first_name} {p.last_name}</span>
                        <Button variant="outline" size="sm" onClick={() => handleAddParticipantToNewChat(p)}><UserPlus className="h-4 w-4 mr-1" /> Add</Button>
                      </div>
                    ))}
                  </ScrollArea>
                )}
                {selectedNewChatParticipants.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedNewChatParticipants.map(p => (
                      <Badge key={p.id} variant="secondary">{p.first_name} <Button variant="ghost" size="icon" className="h-4 w-4 ml-1" onClick={() => handleRemoveParticipantFromNewChat(p.id)}><X className="h-3 w-3" /></Button></Badge>
                    ))}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={handleCreateNewChat} disabled={isCreatingChat}>Create Chat</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="ghost" size="icon" onClick={() => navigate('/profile')}><UserIcon className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" onClick={handleLogout}><LogOut className="h-5 w-5" /></Button>
        </div>
      </div>

      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search chats..." className="pl-10 w-full rounded-full" value={conversationSearchTerm} onChange={e => setConversationSearchTerm(e.target.value)} />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {filteredConversations.length === 0 ? (
          <p className="p-4 text-muted-foreground text-center">No conversations yet.</p>
        ) : (
          filteredConversations.map(conv => (
            <ConversationItem key={conv.id} conversation={conv} isSelected={conv.id === selectedConversationId} onSelect={onSelectConversation} currentUser={currentUser} />
          ))
        )}
      </ScrollArea>
    </div>
  );
};