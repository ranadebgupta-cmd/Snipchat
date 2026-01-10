"use client";

import React from 'react';
import { useAuth } from '@/integrations/supabase/auth';
import { Navigate } from 'react-router-dom';
import { CustomAuthForm } from '@/components/CustomAuthForm';
import { Spinner } from '@/components/Spinner'; // Import Spinner

const Login = () => {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-500 to-purple-600">
        <Spinner size="lg" className="text-white" />
        <p className="ml-3 text-lg text-white">Loading authentication...</p>
      </div>
    );
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 p-4">
      <CustomAuthForm />
    </div>
  );
};

export default Login;