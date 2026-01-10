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
    const { email } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create a Supabase client with the service role key for admin actions
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // The URL where the user will be redirected after clicking the confirmation link.
    // This should be a route in your React app, e.g., /auth/callback
    const redirectTo = `${req.headers.get('origin')}/auth/callback`;

    // Generate a signup confirmation link using the admin client
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email: email,
      options: {
        redirectTo: redirectTo,
      },
    });

    if (error) {
      console.error("[send-confirmation-email] Error generating confirmation link:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const confirmationLink = data.properties?.emailRedirectTo;

    // --- Placeholder for actual email sending logic ---
    console.log(`[send-confirmation-email] Sending custom SnipChat confirmation email to ${email}`);
    console.log(`[send-confirmation-email] Subject: Welcome to SnipChat! Confirm your email`);
    console.log(`[send-confirmation-email] Body: Hi there! Please confirm your email by clicking this link: ${confirmationLink}`);
    // In a real application, you would integrate with an email service here (e.g., SendGrid, Resend)
    // Example: await sendEmailService.send({ to: email, subject: '...', body: `...${confirmationLink}...` });
    // --- End Placeholder ---

    return new Response(JSON.stringify({ message: 'Confirmation email sent successfully.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error("[send-confirmation-email] Error in Edge Function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});