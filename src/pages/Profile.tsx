"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/integrations/supabase/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { showSuccess, showError } from '@/utils/toast';
import { Spinner } from '@/components/Spinner';
import { useNavigate } from 'react-router-dom';

interface ProfileData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

const Profile = () => {
  const { user, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isAuthLoading && !user) {
      navigate('/login');
      return;
    }

    const fetchProfile = async () => {
      if (!user) return;
      setIsLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error("Error fetching profile:", error);
        showError("Failed to load profile data.");
        setProfile(null);
      } else {
        setProfile(data);
        setFirstName(data.first_name || '');
        setLastName(data.last_name || '');
        setAvatarUrl(data.avatar_url || '');
      }
      setIsLoading(false);
    };

    fetchProfile();
  }, [user, isAuthLoading, navigate]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    setIsSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) {
      console.error("Error updating profile:", error);
      showError("Failed to update profile.");
    } else {
      showSuccess("Profile updated successfully!");
      // Optionally, refresh user session or profile state in ChatApp if needed
    }
    setIsSaving(false);
  };

  if (isAuthLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-background">
        <Spinner size="lg" />
        <p className="ml-3 text-lg text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-background text-foreground">
        <p className="text-lg text-muted-foreground">Profile not found or not logged in.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-md bg-card text-card-foreground rounded-lg shadow-lg mt-10">
      <h1 className="text-3xl font-bold text-center mb-6">Edit Profile</h1>
      <form onSubmit={handleSave} className="space-y-6">
        <div className="flex flex-col items-center space-y-4">
          <Avatar className="h-24 w-24">
            <AvatarImage src={avatarUrl || "/placeholder.svg"} alt={`${firstName} ${lastName}`} />
            <AvatarFallback className="text-4xl">{firstName.charAt(0) || lastName.charAt(0) || 'U'}</AvatarFallback>
          </Avatar>
          <div className="w-full">
            <Label htmlFor="avatarUrl" className="sr-only">Avatar URL</Label>
            <Input
              id="avatarUrl"
              type="url"
              placeholder="Avatar URL"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="text-center"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="firstName">First Name</Label>
          <Input
            id="firstName"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
        </div>

        <div>
          <Label htmlFor="lastName">Last Name</Label>
          <Input
            id="lastName"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </div>

        <Button type="submit" className="w-full" disabled={isSaving}>
          {isSaving ? <Spinner size="sm" className="mr-2" /> : null}
          {isSaving ? 'Saving...' : 'Save Profile'}
        </Button>
      </form>
    </div>
  );
};

export default Profile;