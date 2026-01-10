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
    console.log("[custom-signup] Request body:", { email, firstName, lastName }); // Log relevant parts of the body

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

    // 1. Create the user using the admin client without sending an email
    const { data: userCreationData, error: userCreationError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
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
    console.log("[custom-signup] User created successfully:", newUser.id);

    // 2. Generate a custom signup confirmation link
    const redirectTo = `${req.headers.get('origin')}/auth/callback`;
    console.log("[custom-signup] Redirect URL for email confirmation:", redirectTo);

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email: newUser.email,
      options: {
        redirectTo: redirectTo,
      },
    });

    if (linkError) {
      console.error("[custom-signup] Error generating confirmation link:", linkError);
      return new Response(JSON.stringify({ error: linkError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const confirmationLink = linkData.properties?.emailRedirectTo;
    console.log("[custom-signup] Generated confirmation link:", confirmationLink);

    // --- IMPORTANT: Placeholder for actual email sending logic ---
    console.log(`[custom-signup] Sending custom SnipChat confirmation email to ${newUser.email}`);
    console.log(`[custom-signup] Subject: Welcome to SnipChat! Confirm your email`);
    console.log(`[custom-signup] Body: Hi ${firstName}! Please confirm your email by clicking this link: ${confirmationLink}`);
    // In a real application, you MUST integrate with an email service here (e.g., SendGrid, Resend)
    // Example: await sendEmailService.send({ to: newUser.email, subject: '...', body: `...${confirmationLink}...` });
    // --- End Placeholder ---

    return new Response(JSON.stringify({ message: 'User created and custom confirmation email details logged. Please implement actual email sending.' }), {
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