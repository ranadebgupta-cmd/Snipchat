"use client";

import React from 'react';
import { useAuth } from '@/integrations/supabase/auth';
import { Navigate } from 'react-router-dom';
import { CustomAuthForm } from '@/components/CustomAuthForm'; // Import the new custom form

const Login = () => {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p className="text-lg text-muted-foreground">Loading authentication...</p>
      </div>
    );
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <CustomAuthForm /> {/* Use the custom authentication form */}
    </div>
  );
};

export default Login;