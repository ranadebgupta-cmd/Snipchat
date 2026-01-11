"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { CallUI } from './CallUI'; // Import the CallUI component

interface Call {
  id: string;
  caller_id: string;
  conversation_id: string;
  status: 'ringing' | 'active' | 'ended' | 'declined';
  call_url: string | null;
  created_at: string;
}

interface CallContextType {
  activeCall: Call | null;
  incomingCall: Call | null;
  startCall: (conversationId: string, participantIds: string[]) => Promise<void>;
  acceptCall: (call: Call) => Promise<void>;
  declineCall: (call: Call) => Promise<void>;
  endCall: (call: Call) => Promise<void>;
  currentUser: User | null;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export const useCall = () => {
  const context = useContext(CallContext);
  if (context === undefined) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
};

interface CallProviderProps {
  children: React.ReactNode;
  currentUser: User | null;
}

export const CallProvider = ({ children, currentUser }: CallProviderProps) => {
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);

  // Real-time listener for calls
  useEffect(() => {
    if (!currentUser) return;

    const channel = supabase
      .channel('public:calls')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'calls' },
        (payload) => {
          const newCall = payload.new as Call;
          console.log("[CallProvider] New call received:", newCall);
          // Check if the current user is a participant in this conversation and not the caller
          if (newCall.caller_id !== currentUser.id) {
            const checkParticipant = async () => {
              const { data, error } = await supabase
                .from('conversation_participants')
                .select('user_id')
                .eq('conversation_id', newCall.conversation_id)
                .eq('user_id', currentUser.id)
                .single();

              if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
                console.error("[CallProvider] Error checking participant status:", error);
              } else if (data) {
                console.log("[CallProvider] Incoming call for current user:", newCall);
                setIncomingCall(newCall);
                showSuccess(`Incoming call from ${newCall.caller_id}!`); // You'd want to fetch caller's name
              }
            };
            checkParticipant();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'calls' },
        (payload) => {
          const updatedCall = payload.new as Call;
          console.log("[CallProvider] Call updated:", updatedCall);
          if (activeCall?.id === updatedCall.id) {
            setActiveCall(updatedCall);
          }
          if (incomingCall?.id === updatedCall.id && updatedCall.status !== 'ringing') {
            setIncomingCall(null); // Dismiss incoming call notification if status changes
          }
          if (updatedCall.status === 'ended' || updatedCall.status === 'declined') {
            if (activeCall?.id === updatedCall.id) {
              setActiveCall(null);
              showSuccess("Call ended.");
            }
            if (incomingCall?.id === updatedCall.id) {
              setIncomingCall(null);
              showError("Call declined or missed.");
            }
          } else if (updatedCall.status === 'active' && updatedCall.caller_id === currentUser.id) {
            // If the caller's call becomes active, set it as activeCall
            setActiveCall(updatedCall);
            setIncomingCall(null); // Clear any potential incoming call state if it was the same call
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'calls' },
        (payload) => {
          const deletedCall = payload.old as Call;
          console.log("[CallProvider] Call deleted:", deletedCall);
          if (activeCall?.id === deletedCall.id) {
            setActiveCall(null);
            showSuccess("Call ended by other party.");
          }
          if (incomingCall?.id === deletedCall.id) {
            setIncomingCall(null);
            showError("Incoming call cancelled.");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser, activeCall, incomingCall]);

  const startCall = useCallback(async (conversationId: string, participantIds: string[]) => {
    if (!currentUser) {
      showError("You must be logged in to start a call.");
      return;
    }

    // Check if there's already an active call for this conversation
    const { data: existingCalls, error: existingCallError } = await supabase
      .from('calls')
      .select('id, status')
      .eq('conversation_id', conversationId)
      .in('status', ['ringing', 'active']);

    if (existingCallError) {
      console.error("[CallProvider] Error checking existing calls:", existingCallError);
      showError("Failed to check for existing calls.");
      return;
    }

    if (existingCalls && existingCalls.length > 0) {
      showError("A call is already active or ringing in this conversation.");
      return;
    }

    // Generate a unique Jitsi Meet room name
    const jitsiRoomName = `Snipchat-${conversationId}-${Date.now()}`;
    const jitsiMeetUrl = `https://meet.jit.si/${jitsiRoomName}`;

    const { data, error } = await supabase
      .from('calls')
      .insert({
        caller_id: currentUser.id,
        conversation_id: conversationId,
        status: 'ringing',
        call_url: jitsiMeetUrl, // Use the generated Jitsi URL
      })
      .select()
      .single();

    if (error) {
      console.error("[CallProvider] Error starting call:", error);
      showError("Failed to start call.");
    } else {
      setActiveCall(data);
      showSuccess("Call started, ringing participants...");
      // The CallUI will now display the "Join Call" button with this URL
    }
  }, [currentUser]);

  const acceptCall = useCallback(async (call: Call) => {
    if (!currentUser) return;

    const { error } = await supabase
      .from('calls')
      .update({ status: 'active' })
      .eq('id', call.id)
      .eq('conversation_id', call.conversation_id); // Ensure we update the correct call

    if (error) {
      console.error("[CallProvider] Error accepting call:", error);
      showError("Failed to accept call.");
    } else {
      setActiveCall({ ...call, status: 'active' });
      setIncomingCall(null);
      showSuccess("Call accepted!");
      // The CallUI will now display the "Join Call" button
    }
  }, [currentUser]);

  const declineCall = useCallback(async (call: Call) => {
    if (!currentUser) return;

    const { error } = await supabase
      .from('calls')
      .update({ status: 'declined' })
      .eq('id', call.id)
      .eq('conversation_id', call.conversation_id);

    if (error) {
      console.error("[CallProvider] Error declining call:", error);
      showError("Failed to decline call.");
    } else {
      setIncomingCall(null);
      showSuccess("Call declined.");
    }
  }, [currentUser]);

  const endCall = useCallback(async (call: Call) => {
    if (!currentUser) return;

    // Only the caller or a participant can end the call by updating its status
    const { error } = await supabase
      .from('calls')
      .update({ status: 'ended' })
      .eq('id', call.id)
      .eq('conversation_id', call.conversation_id);

    if (error) {
      console.error("[CallProvider] Error ending call:", error);
      showError("Failed to end call.");
    } else {
      setActiveCall(null);
      setIncomingCall(null);
      showSuccess("Call ended.");
    }
  }, [currentUser]);

  const contextValue = {
    activeCall,
    incomingCall,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    currentUser,
  };

  return (
    <CallContext.Provider value={contextValue}>
      {children}
      {(activeCall || incomingCall) && (
        <CallUI
          activeCall={activeCall}
          incomingCall={incomingCall}
          onAccept={acceptCall}
          onDecline={declineCall}
          onEnd={endCall}
          currentUser={currentUser}
        />
      )}
    </CallContext.Provider>
  );
};