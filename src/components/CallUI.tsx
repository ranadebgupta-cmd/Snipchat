"use client";

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PhoneCall, PhoneOff, Video, Mic, Volume2, UserX } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import { Spinner } from './Spinner';

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

interface CallUIProps {
  activeCall: Call | null;
  incomingCall: Call | null;
  onAccept: (call: Call) => Promise<void>;
  onDecline: (call: Call) => Promise<void>;
  onEnd: (call: Call) => Promise<void>;
  currentUser: User | null;
}

export const CallUI = ({ activeCall, incomingCall, onAccept, onDecline, onEnd, currentUser }: CallUIProps) => {
  const [callerProfile, setCallerProfile] = useState<Profile | null>(null);
  const [conversationName, setConversationName] = useState<string | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false); // New state for video toggle

  const call = activeCall || incomingCall;
  const isOpen = !!call;

  useEffect(() => {
    const fetchCallDetails = async () => {
      if (!call || !currentUser) {
        setCallerProfile(null);
        setConversationName(null);
        return;
      }

      setIsLoadingDetails(true);
      try {
        // Fetch caller profile - now including 'id'
        const { data: callerData, error: callerError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url') // Added 'id'
          .eq('id', call.caller_id)
          .single();

        if (callerError) {
          console.error("[CallUI] Error fetching caller profile:", callerError);
        } else {
          setCallerProfile(callerData);
        }

        // Fetch conversation name and participants' profiles - now including 'id'
        const { data: conversationData, error: conversationError } = await supabase
          .from('conversations')
          .select('name, conversation_participants(profiles(id, first_name, last_name))') // Added 'id' to profiles
          .eq('id', call.conversation_id)
          .single();

        if (conversationError) {
          console.error("[CallUI] Error fetching conversation details:", conversationError);
        } else {
          if (conversationData.name) {
            setConversationName(conversationData.name);
          } else {
            // For 1-on-1 chats, construct name from other participant
            const otherParticipant = conversationData.conversation_participants.find(
              (p: any) => p.profiles.id !== currentUser.id && p.profiles.id !== call.caller_id
            );
            if (otherParticipant?.profiles && otherParticipant.profiles.length > 0) {
              // Accessing properties directly from otherParticipant.profiles which is now a single object
              const profile = otherParticipant.profiles[0]; // Access the first profile in the array
              setConversationName(`${profile.first_name || ''} ${profile.last_name || ''}`.trim());
            } else if (call.caller_id === currentUser.id && callerData) {
              // If current user is caller and it's a 1-on-1, show "Calling..."
              setConversationName(`Calling ${callerData.first_name || ''} ${callerData.last_name || ''}`.trim());
            }
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
      return `Incoming Call from ${callerProfile?.first_name || 'Unknown'}`;
    } else if (activeCall) {
      if (isCaller) {
        return `Calling ${conversationName || '...'}`;
      }
      return `Active Call in ${conversationName || '...'}`;
    }
    return "Call";
  };

  const getSubtitle = () => {
    if (isIncoming) {
      return `From ${callerProfile?.first_name || ''} ${callerProfile?.last_name || ''}`.trim();
    } else if (activeCall) {
      return `Conversation: ${conversationName || '...'}`;
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
                    {callerProfile?.first_name?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <DialogTitle className="text-3xl font-extrabold">{getTitle()}</DialogTitle>
                <DialogDescription className="text-lg text-white/80 mt-1">{getSubtitle()}</DialogDescription>
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
              {/* Placeholder for actual call controls */}
              <Button variant="ghost" className="text-white hover:bg-white/20 rounded-full h-12 w-12 flex items-center justify-center">
                <Mic className="h-6 w-6" />
                <span className="sr-only">Mute Mic</span>
              </Button>
              <Button
                variant="ghost"
                className={`text-white rounded-full h-12 w-12 flex items-center justify-center ${isVideoEnabled ? 'bg-white/30' : 'hover:bg-white/20'}`}
                onClick={() => setIsVideoEnabled(!isVideoEnabled)}
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
            {/* In a real app, you'd embed the WebRTC video/audio here */}
            {isVideoEnabled ? (
              <div className="w-full h-48 bg-gray-700 rounded-lg flex items-center justify-center text-lg text-white/70 mb-2">
                Video Stream Placeholder
              </div>
            ) : (
              <p>Video is off.</p>
            )}
            <p>Call is active. (WebRTC stream would go here)</p>
            <p>Join URL: <a href={activeCall.call_url} target="_blank" rel="noopener noreferrer" className="underline hover:text-white/70">{activeCall.call_url}</a></p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};