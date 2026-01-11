"use client";

import React, { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Spinner } from '@/components/Spinner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PhoneCall, PhoneOff, Mic, Video, Volume2 } from 'lucide-react'; // Import icons

interface Call {
  id: string;
  caller_id: string;
  conversation_id: string;
  status: 'ringing' | 'active' | 'ended' | 'declined';
  call_url: string | null;
  created_at: string;
}

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

interface ConversationParticipant {
  user_id: string;
  profiles: Profile;
}

interface ConversationDetails {
  name: string | null;
  conversation_participants: ConversationParticipant[];
}

interface CallUIProps {
  activeCall: Call | null;
  incomingCall: Call | null;
  onAccept: (call: Call) => void;
  onDecline: (call: Call) => void;
  onEnd: (call: Call) => void;
  currentUser: User | null;
}

export const CallUI = ({
  activeCall,
  incomingCall,
  onAccept,
  onDecline,
  onEnd,
  currentUser,
}: CallUIProps) => {
  const call = activeCall || incomingCall;
  const isOpen = !!call;

  const [callerProfile, setCallerProfile] = useState<Profile | null>(null);
  const [conversationName, setConversationName] = useState<string | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);

  useEffect(() => {
    const fetchCallDetails = async () => {
      if (!call || !currentUser) {
        setCallerProfile(null);
        setConversationName(null);
        return;
      }

      setIsLoadingDetails(true);
      try {
        // Fetch caller profile
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .eq('id', call.caller_id)
          .single();

        if (profileError) {
          console.error("[CallUI] Error fetching caller profile:", profileError);
        } else {
          setCallerProfile(profileData);
        }

        // Fetch conversation details
        const { data: conversationData, error: conversationError } = await supabase
          .from('conversations')
          .select('name, conversation_participants(profiles(id, first_name, last_name))')
          .eq('id', call.conversation_id)
          .single();

        if (conversationError) {
          console.error("[CallUI] Error fetching conversation details:", conversationError);
        } else if (conversationData.name) {
          setConversationName(conversationData.name);
        } else {
          // For 1-on-1 chats, determine the other participant's name
          const otherParticipant = conversationData.conversation_participants.find(
            (p: any) => p.profiles.id !== currentUser.id && p.profiles.id !== call.caller_id
          );
          if (otherParticipant?.profiles && otherParticipant.profiles.length > 0) {
            const otherUser = otherParticipant.profiles[0];
            setConversationName(`${otherUser.first_name || ""} ${otherUser.last_name || ""}`.trim());
          } else if (call.caller_id === currentUser.id && profileData) {
            // If current user is the caller, and it's a 1-on-1, show "Calling [other user]"
            setConversationName(`Calling ${profileData.first_name || ""} ${profileData.last_name || ""}`.trim());
          }
        }
      } catch (error) {
        console.error("[CallUI] Unexpected error fetching call details:", error);
      } finally {
        setIsLoadingDetails(false);
      }
    };

    fetchCallDetails();
  }, [call, currentUser]);

  if (!call) return null;

  const isIncoming = !!incomingCall;
  const isCaller = currentUser?.id === call.caller_id;

  const getTitle = () => {
    if (isIncoming) {
      return `Incoming Call from ${callerProfile?.first_name || "Unknown"}`;
    }
    if (activeCall) {
      return isCaller ? `Calling ${conversationName || "..."}` : `Active Call in ${conversationName || "..."}`;
    }
    return "Call";
  };

  const getDescription = () => {
    if (isIncoming) {
      return `From ${callerProfile?.first_name || ""} ${callerProfile?.last_name || ""}`.trim();
    }
    if (activeCall) {
      return `Conversation: ${conversationName || "..."}`;
    }
    return "";
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => { /* Prevent closing via overlay click */ }}>
      <DialogContent className="sm:max-w-[425px] bg-gradient-to-br from-blue-500 to-purple-600 text-white p-6 rounded-xl shadow-2xl animate-fade-in">
        <DialogHeader className="text-center">
          <div className="flex flex-col items-center mb-4">
            {isLoadingDetails ? (
              <Spinner size="lg" className="text-white" />
            ) : (
              <>
                <Avatar className="h-24 w-24 border-4 border-white shadow-lg mb-3">
                  <AvatarImage src={callerProfile?.avatar_url || "/placeholder.svg"} alt={callerProfile?.first_name || "Caller"} />
                  <AvatarFallback className="text-5xl bg-white text-blue-600">
                    {callerProfile?.first_name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <DialogTitle className="text-3xl font-extrabold">{getTitle()}</DialogTitle>
                <DialogDescription className="text-lg text-white/80 mt-1">
                  {getDescription()}
                </DialogDescription>
              </>
            )}
          </div>
        </DialogHeader>
        <div className="flex justify-center gap-4 mt-6">
          {isIncoming ? (
            <>
              <Button
                className="bg-green-500 hover:bg-green-600 text-white rounded-full h-16 w-16 flex items-center justify-center shadow-lg transition-transform hover:scale-105"
                onClick={() => onAccept(call)}
              >
                <PhoneCall className="h-8 w-8" />
                <span className="sr-only">Accept Call</span>
              </Button>
              <Button
                className="bg-red-500 hover:bg-red-600 text-white rounded-full h-16 w-16 flex items-center justify-center shadow-lg transition-transform hover:scale-105"
                onClick={() => onDecline(call)}
              >
                <PhoneOff className="h-8 w-8" />
                <span className="sr-only">Decline Call</span>
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" className="text-white hover:bg-white/20 rounded-full h-12 w-12 flex items-center justify-center">
                <Mic className="h-6 w-6" />
                <span className="sr-only">Mute Mic</span>
              </Button>
              <Button
                variant="ghost"
                className={`text-white rounded-full h-12 w-12 flex items-center justify-center ${isVideoOff ? 'bg-white/30' : 'hover:bg-white/20'}`}
                onClick={() => setIsVideoOff(!isVideoOff)}
              >
                <Video className="h-6 w-6" />
                <span className="sr-only">Toggle Video</span>
              </Button>
              <Button variant="ghost" className="text-white hover:bg-white/20 rounded-full h-12 w-12 flex items-center justify-center">
                <Volume2 className="h-6 w-6" />
                <span className="sr-only">Toggle Speaker</span>
              </Button>
              <Button
                className="bg-red-500 hover:bg-red-600 text-white rounded-full h-16 w-16 flex items-center justify-center shadow-lg transition-transform hover:scale-105"
                onClick={() => onEnd(call)}
              >
                <PhoneOff className="h-8 w-8" />
                <span className="sr-only">End Call</span>
              </Button>
            </>
          )}
        </div>
        {activeCall && activeCall.call_url && (
          <div className="mt-6 text-center text-white/90 text-sm">
            <p className="mb-2">Click the button below to join the Jitsi Meet call:</p>
            <Button asChild className="bg-blue-700 hover:bg-blue-800 text-white font-bold py-2 px-4 rounded-lg transition-colors">
              <a href={activeCall.call_url} target="_blank" rel="noopener noreferrer">
                Join Call
              </a>
            </Button>
            <p className="mt-4 text-xs opacity-80">(This will open Jitsi Meet in a new tab. The in-app video toggle is a placeholder for future direct embedding.)</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};