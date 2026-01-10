"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/integrations/supabase/auth";
import { showError, showSuccess } from "@/utils/toast";
import { User } from "@supabase/supabase-js";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { Spinner } from "./Spinner";
import { Label } from "@/components/ui/label"; // Import Label for the group name input

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

interface NewConversationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConversationCreated: (conversationId: string) => void;
}

export const NewConversationDialog = ({
  isOpen,
  onClose,
  onConversationCreated,
}: NewConversationDialogProps) => {
  const { user: currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<Profile[]>([]);
  const [groupName, setGroupName] = useState(""); // New state for group name
  const [isCreating, setIsCreating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const searchUsers = async () => {
      if (!searchTerm.trim()) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, avatar_url")
        .or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%`) // Search by first OR last name
        .neq("id", currentUser?.id); // Exclude current user

      if (error) {
        console.error("Error searching users:", error);
        showError("Failed to search users.");
        setSearchResults([]);
      } else {
        setSearchResults(data || []);
      }
      setIsSearching(false);
    };

    const handler = setTimeout(() => {
      searchUsers();
    }, 300); // Debounce search

    return () => clearTimeout(handler);
  }, [searchTerm, currentUser]);

  const handleSelectParticipant = (profile: Profile, checked: boolean) => {
    if (checked) {
      setSelectedParticipants((prev) => [...prev, profile]);
    } else {
      setSelectedParticipants((prev) => prev.filter((p) => p.id !== profile.id));
    }
  };

  const handleCreateConversation = async () => {
    if (!currentUser || selectedParticipants.length === 0) {
      showError("Please select at least one participant.");
      return;
    }

    // If more than one participant (excluding current user) is selected, or if a group name is provided, it's a group chat.
    // Otherwise, it's a 1-on-1 chat.
    const isGroupChat = selectedParticipants.length > 1 || groupName.trim() !== "";

    if (isGroupChat && !groupName.trim()) {
      showError("Please provide a group name for group chats.");
      return;
    }

    setIsCreating(true);
    try {
      // 1. Create the conversation
      const { data: conversationData, error: conversationError } = await supabase
        .from("conversations")
        .insert({ name: isGroupChat ? groupName.trim() : null }) // Insert group name if it's a group chat
        .select("id")
        .single();

      if (conversationError || !conversationData) {
        throw new Error(conversationError?.message || "Failed to create conversation.");
      }

      const conversationId = conversationData.id;

      // 2. Add current user as participant
      const participantsToInsert = [{ conversation_id: conversationId, user_id: currentUser.id }];

      // 3. Add selected participants
      selectedParticipants.forEach((p) => {
        participantsToInsert.push({ conversation_id: conversationId, user_id: p.id });
      });

      const { error: participantsError } = await supabase
        .from("conversation_participants")
        .insert(participantsToInsert);

      if (participantsError) {
        throw new Error(participantsError?.message || "Failed to add participants.");
      }

      showSuccess("Conversation created successfully!");
      onConversationCreated(conversationId);
      handleClose();
    } catch (error: any) {
      console.error("Error creating conversation:", error);
      showError(error.message || "An unexpected error occurred.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setSearchTerm("");
    setSearchResults([]);
    setSelectedParticipants([]);
    setGroupName(""); // Reset group name
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Start New Chat</DialogTitle>
          <DialogDescription>
            Search for users and select them to start a new conversation. Provide a group name for group chats.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {selectedParticipants.length > 0 && ( // Show group name input if participants are selected
            <div>
              <Label htmlFor="group-name" className="mb-2 block">Group Name (Optional for 1-on-1, Required for groups)</Label>
              <Input
                id="group-name"
                placeholder="Enter group name..."
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="focus-visible:ring-primary"
              />
            </div>
          )}
          <Input
            placeholder="Search users by first name or last name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="focus-visible:ring-primary"
          />
          <ScrollArea className="h-[200px] w-full rounded-md border">
            {isSearching ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <Spinner size="sm" />
                <p className="ml-2">Searching...</p>
              </div>
            ) : searchResults.length === 0 && searchTerm.trim() ? (
              <p className="p-4 text-center text-muted-foreground">No users found.</p>
            ) : (
              searchResults.map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-center p-3 hover:bg-accent cursor-pointer transition-colors duration-200"
                  onClick={() =>
                    handleSelectParticipant(
                      profile,
                      !selectedParticipants.some((p) => p.id === profile.id)
                    )
                  }
                >
                  <Checkbox
                    checked={selectedParticipants.some((p) => p.id === profile.id)}
                    onCheckedChange={(checked) =>
                      handleSelectParticipant(profile, checked as boolean)
                    }
                    className="mr-3 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                  />
                  <Avatar className="h-8 w-8 mr-3">
                    <AvatarImage
                      src={profile.avatar_url || `https://api.dicebear.com/7.x/lorelei/svg?seed=${profile.first_name || 'User'}`}
                      alt={`${profile.first_name} ${profile.last_name}`}
                    />
                    <AvatarFallback>{profile.first_name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <p className="font-medium">
                    {`${profile.first_name || ""} ${profile.last_name || ""}`.trim()}
                  </p>
                </div>
              ))
            )}
          </ScrollArea>
          {selectedParticipants.length > 0 && (
            <div className="mt-2">
              <p className="text-sm font-medium mb-2">Selected:</p>
              <div className="flex flex-wrap gap-2">
                {selectedParticipants.map((p) => (
                  <Badge key={p.id} variant="secondary" className="flex items-center bg-primary text-primary-foreground">
                    {`${p.first_name || ""} ${p.last_name || ""}`.trim()}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 ml-1 text-primary-foreground hover:bg-primary/80"
                      onClick={() => handleSelectParticipant(p, false)}
                    >
                      <X className="h-3 w-3" />
                      <span className="sr-only">Remove</span>
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreateConversation} disabled={selectedParticipants.length === 0 || isCreating}>
            {isCreating ? <Spinner size="sm" className="text-primary-foreground" /> : "Create Chat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};