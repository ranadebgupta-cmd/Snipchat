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
import { Spinner } from "./Spinner"; // Import the Spinner component
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
  const [isSearching, setIsSearching] = useState(false); // State for search loading

  useEffect(() => {
    const searchUsers = async () => {
      if (!searchTerm.trim()) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true); // Set searching state
      let query = supabase
        .from("profiles")
        .select("id, first_name, last_name, avatar_url")
        .neq("id", currentUser?.id); // Exclude current user

      const searchParts = searchTerm.trim().split(/\s+/).filter(Boolean);

      // Apply an 'AND' logic across multiple search parts
      searchParts.forEach(part => {
        const lowerCasePart = part.toLowerCase();
        query = query.or(`first_name.ilike.%${lowerCasePart}%,last_name.ilike.%${lowerCasePart}%`);
      });

      const { data, error } = await query;

      if (error) {
        console.error("Error searching users:", error);
        showError("Failed to search users.");
        setSearchResults([]);
      } else {
        setSearchResults(data || []);
      }
      setIsSearching(false); // Reset searching state
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

    const isGroupChat = selectedParticipants.length > 1 || groupName.trim() !== "";

    if (isGroupChat && !groupName.trim()) {
      showError("Please provide a group name for group chats.");
      return;
    }

    setIsCreating(true);
    try {
      console.log("[NewConversationDialog] Attempting to create conversation...");
      // 1. Create the conversation with minimal data, relying on defaults
      const { data: conversationData, error: conversationError } = await supabase
        .from("conversations")
        .insert({})
        .select("id")
        .single();

      if (conversationError || !conversationData) {
        console.error("[NewConversationDialog] Error creating conversation:", conversationError);
        console.error("[NewConversationDialog] Supabase error details:", JSON.stringify(conversationError, null, 2));
        throw new Error(conversationError?.message || "Failed to create conversation.");
      }

      const conversationId = conversationData.id;
      console.log("[NewConversationDialog] Successfully created conversation with ID:", conversationId);

      // Collect all participant IDs, including the current user
      const allParticipantIds = [currentUser.id, ...selectedParticipants.map(p => p.id)];

      // 2. Call the Edge Function to add all participants
      console.log("[NewConversationDialog] Invoking Edge Function to add participants...");
      const { data: edgeFunctionResponse, error: edgeFunctionError } = await supabase.functions.invoke('add-conversation-participants', {
        body: {
          conversation_id: conversationId,
          participant_ids: allParticipantIds,
        },
      });

      if (edgeFunctionError) {
        console.error("[NewConversationDialog] Error invoking add-conversation-participants Edge Function:", edgeFunctionError);
        throw new Error(edgeFunctionError.message || "Failed to add participants via Edge Function.");
      }
      console.log("[NewConversationDialog] Edge Function response:", edgeFunctionResponse);
      
      // If it's a group chat and a name was provided, update the conversation name
      if (isGroupChat && groupName.trim()) {
        const { error: updateError } = await supabase
          .from("conversations")
          .update({ name: groupName.trim() })
          .eq("id", conversationId);

        if (updateError) {
          console.error("[NewConversationDialog] Error updating conversation name:", updateError);
          throw new Error(updateError?.message || "Failed to set group name.");
        }
      }

      showSuccess("Conversation created successfully!");
      onConversationCreated(conversationId);
      handleClose();
    } catch (error: any) {
      console.error("[NewConversationDialog] Error creating conversation:", error);
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