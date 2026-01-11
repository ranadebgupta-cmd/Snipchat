"use client";

import React from 'react';
import { User } from '@supabase/supabase-js';
import { cn } from '@/lib/utils';

interface WelcomeBannerProps {
  user: User;
  className?: string;
}

export const WelcomeBanner = ({ user, className }: WelcomeBannerProps) => {
  const userName = user.user_metadata?.first_name || user.email?.split('@')[0] || 'User';

  return (
    <div className={cn(
      "relative p-6 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg shadow-lg overflow-hidden",
      "flex items-center justify-between animate-fade-in",
      className
    )}>
      <div className="absolute inset-0 opacity-20 bg-[url('/placeholder.svg')] bg-cover bg-center pointer-events-none"></div>
      <div className="relative z-10">
        <h1 className="text-3xl font-bold mb-1">Welcome, {userName}!</h1>
        <p className="text-lg opacity-90">Ready to connect and chat?</p>
      </div>
      <div className="relative z-10 text-4xl">
        👋
      </div>
    </div>
  );
};