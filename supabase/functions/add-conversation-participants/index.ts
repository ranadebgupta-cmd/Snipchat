// @ts-ignore: Deno-specific URL import
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore: Deno-specific URL import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Manual authentication check (since verify_jwt is false)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.warn("[add-conversation-participants] Unauthorized: Missing Authorization header.");
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(
      // @ts-ignore: Deno global is available in Edge Functions runtime
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-ignore: Deno global is available in Edge Functions runtime
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { data: user, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user.user) {
      console.error("[add-conversation-participants] Error getting user from token:", userError?.message);
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { conversation_id, participant_ids } = await req.json();
    console.log(`[add-conversation-participants] Received request for conversation_id: ${conversation_id}, participant_ids: ${participant_ids}`);

    if (!conversation_id || !Array.isArray(participant_ids) || participant_ids.length === 0) {
      console.warn("[add-conversation-participants] Bad Request: Missing conversation_id or participant_ids.");
      return new Response(JSON.stringify({ error: 'Conversation ID and at least one participant ID are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create a Supabase client with the service role key for admin actions
    const supabaseAdmin = createClient(
      // @ts-ignore: Deno global is available in Edge Functions runtime
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-ignore: Deno global is available in Edge Functions runtime
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const participantsToInsert = participant_ids.map((userId: string) => ({
      conversation_id: conversation_id,
      user_id: userId,
    }));

    console.log("[add-conversation-participants] Inserting participants:", participantsToInsert);
    const { data, error } = await supabaseAdmin
      .from('conversation_participants')
      .insert(participantsToInsert);

    if (error) {
      console.error("[add-conversation-participants] Error inserting participants:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log("[add-conversation-participants] Participants added successfully.");
    return new Response(JSON.stringify({ message: 'Participants added successfully.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error("[add-conversation-participants] Uncaught error in Edge Function:", error);
    return new Response(JSON.stringify({ error: error.message || 'An unexpected server error occurred.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});