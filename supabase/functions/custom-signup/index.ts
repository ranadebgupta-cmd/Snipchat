import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
    const { email, password, firstName, lastName } = await req.json();
    console.log("[custom-signup] Received signup request for email:", email);
    console.log("[custom-signup] Request body:", { email, firstName, lastName });

    if (!email || !password || !firstName || !lastName) {
      console.warn("[custom-signup] Missing required fields in request body.");
      return new Response(JSON.stringify({ error: 'Email, password, first name, and last name are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("[custom-signup] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables are not set.");
      return new Response(JSON.stringify({ error: 'Server configuration error: Supabase environment variables missing.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Create the user using the admin client and immediately confirm their email
    // Setting email_confirm: true here means the user's email is marked as confirmed
    // upon creation, bypassing the need for a confirmation email.
    const { data: userCreationData, error: userCreationError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // User's email is immediately confirmed
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
      },
    });

    if (userCreationError) {
      console.error("[custom-signup] Error creating user:", userCreationError);
      return new Response(JSON.stringify({ error: userCreationError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const newUser = userCreationData.user;
    if (!newUser) {
      console.error("[custom-signup] User creation failed, no user data returned from Supabase.");
      return new Response(JSON.stringify({ error: 'User creation failed, no user data returned.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log("[custom-signup] User created and email immediately confirmed:", newUser.id);

    // No need to generate or send a confirmation link/email as the user is already confirmed.

    return new Response(JSON.stringify({ message: 'User created and email immediately confirmed. Ready to log in.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error("[custom-signup] Uncaught error in Edge Function:", error);
    return new Response(JSON.stringify({ error: error.message || 'An unexpected server error occurred.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});