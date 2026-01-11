import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { Expo } from 'https://esm.sh/expo-server-sdk@3.7.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[send-message-notification] Function invoked.");

  // Manual authentication handling (since verify_jwt is false)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    console.warn("[send-message-notification] Unauthorized: Missing Authorization header.");
    return new Response('Unauthorized', {
      status: 401,
      headers: corsHeaders,
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    }
  );

  try {
    const { message_id } = await req.json();
    console.log(`[send-message-notification] Received message_id: ${message_id}`);

    // Fetch the new message and its sender
    const { data: message, error: messageError } = await supabaseClient
      .from('messages')
      .select('id, conversation_id, sender_id, content, profiles(first_name, last_name)')
      .eq('id', message_id)
      .single();

    if (messageError || !message) {
      console.error("[send-message-notification] Error fetching message or message not found:", messageError?.message || 'Message not found');
      return new Response(JSON.stringify({ error: 'Message not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const senderName = message.profiles ? `${message.profiles.first_name || ''} ${message.profiles.last_name || ''}`.trim() : 'Someone';
    const notificationTitle = `New message from ${senderName}`;
    const notificationBody = message.content;
    const conversationId = message.conversation_id;
    const senderId = message.sender_id;

    console.log(`[send-message-notification] Message details: Conversation ID: ${conversationId}, Sender ID: ${senderId}`);

    // Fetch all participants in the conversation
    const { data: participants, error: participantsError } = await supabaseClient
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId);

    if (participantsError || !participants) {
      console.error("[send-message-notification] Error fetching participants:", participantsError?.message || 'No participants found');
      return new Response(JSON.stringify({ error: 'Participants not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const recipientUserIds = participants
      .map(p => p.user_id)
      .filter(id => id !== senderId); // Exclude the sender

    if (recipientUserIds.length === 0) {
      console.log("[send-message-notification] No recipients for notification (sender is the only participant or no other participants).");
      return new Response(JSON.stringify({ message: 'No recipients for notification' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[send-message-notification] Recipient user IDs: ${recipientUserIds.join(', ')}`);

    // Fetch device tokens for recipients
    const { data: deviceTokens, error: tokensError } = await supabaseClient
      .from('device_tokens')
      .select('token')
      .in('user_id', recipientUserIds);

    if (tokensError || !deviceTokens || deviceTokens.length === 0) {
      console.warn("[send-message-notification] No device tokens found for recipients.");
      return new Response(JSON.stringify({ message: 'No device tokens found for recipients' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pushTokens = deviceTokens.map(dt => dt.token).filter(token => Expo.isExpoPushToken(token));
    console.log(`[send-message-notification] Valid Expo Push Tokens found: ${pushTokens.length}`);

    if (pushTokens.length === 0) {
      console.warn("[send-message-notification] No valid Expo Push Tokens to send notifications to.");
      return new Response(JSON.stringify({ message: 'No valid Expo Push Tokens' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const expo = new Expo({ accessToken: Deno.env.get('EXPO_ACCESS_TOKEN') });
    const messages = [];

    for (const pushToken of pushTokens) {
      messages.push({
        to: pushToken,
        sound: 'default',
        title: notificationTitle,
        body: notificationBody,
        data: { conversationId: conversationId, messageId: message.id },
      });
    }

    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        console.log("[send-message-notification] Sent push notification chunk:", ticketChunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error("[send-message-notification] Error sending push notification chunk:", error);
      }
    }

    console.log("[send-message-notification] Push notifications sent. Tickets:", tickets);

    return new Response(JSON.stringify({ success: true, tickets }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[send-message-notification] Error processing request: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});