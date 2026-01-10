"use client";

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';

const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState('Processing email confirmation...');

  useEffect(() => {
    const handleCallback = async () => {
      const type = searchParams.get('type');
      const token_hash = searchParams.get('token');
      const error_description = searchParams.get('error_description');

      if (error_description) {
        setMessage(`Error: ${error_description}`);
        showError(`Email confirmation failed: ${error_description}`);
        setTimeout(() => navigate('/login'), 3000);
        return;
      }

      if (type === 'signup' && token_hash) {
        const { error } = await supabase.auth.verifyOtp({
          type: 'signup',
          token_hash: token_hash,
        });

        if (error) {
          console.error("Error verifying OTP for signup:", error);
          setMessage(`Error confirming email: ${error.message}`);
          showError(`Error confirming email: ${error.message}`);
        } else {
          setMessage('Email confirmed successfully! Redirecting...');
          showSuccess('Your email has been successfully confirmed!');
          navigate('/'); // Redirect to home page after successful confirmation
        }
      } else {
        setMessage('Invalid confirmation link.');
        showError('Invalid confirmation link.');
      }
      // Fallback redirect after a delay if no specific action is taken
      setTimeout(() => navigate('/login'), 3000); 
    };

    handleCallback();
  }, [navigate, searchParams]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <p className="text-lg text-muted-foreground">{message}</p>
    </div>
  );
};

export default AuthCallback;