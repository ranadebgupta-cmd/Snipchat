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
import { Camera } from 'lucide-react'; // Import Camera icon

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
  const [isUploading, setIsUploading] = useState(false); // New state for upload loading

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
      navigate('/'); // Redirect to chat conversation page
    }
    setIsSaving(false);
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) {
      showError("You must be logged in to upload an avatar.");
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}.${fileExt}`; // Use user ID as filename to ensure uniqueness per user
    const filePath = `${user.id}/${fileName}`; // Store in a folder named after the user ID

    try {
      // Upload file to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true, // Overwrite existing file if it has the same name
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      if (publicUrlData) {
        setAvatarUrl(publicUrlData.publicUrl);
        // Update profile in the database
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ avatar_url: publicUrlData.publicUrl, updated_at: new Date().toISOString() })
          .eq('id', user.id);

        if (updateError) {
          throw updateError;
        }
        showSuccess("Avatar uploaded and profile updated!");
      } else {
        throw new Error("Failed to get public URL for the uploaded avatar.");
      }
    } catch (error: any) {
      console.error("Error uploading avatar:", error);
      showError(`Failed to upload avatar: ${error.message || "Unknown error"}`);
    } finally {
      setIsUploading(false);
    }
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-600 dark:from-gray-900 dark:to-indigo-950 p-4 animate-gradient-xy">
      <style>{`
        @keyframes gradient-xy {
          0%, 100% {
            background-position: 0% 0%;
          }
          50% {
            background-position: 100% 100%;
          }
        }
        .animate-gradient-xy {
          background-size: 400% 400%;
          animation: gradient-xy 15s ease infinite;
        }
      `}</style>
      <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-gray-800 rounded-xl shadow-2xl transform transition-all duration-300 hover:scale-105 hover:shadow-3xl animate-fade-in">
        <h1 className="text-4xl font-extrabold text-center text-gray-900 dark:text-white mb-6 tracking-tight">
          Edit Your Profile
        </h1>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="relative group">
              <Avatar className="h-28 w-28 border-4 border-primary dark:border-primary-foreground shadow-lg transition-transform group-hover:scale-105">
                <AvatarImage src={avatarUrl || "/placeholder.svg"} alt={`${firstName} ${lastName}`} />
                <AvatarFallback className="text-5xl bg-primary text-primary-foreground">
                  {firstName.charAt(0) || lastName.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <Label htmlFor="avatar-upload" className="absolute inset-0 flex items-center justify-center bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                {isUploading ? <Spinner size="sm" className="text-white" /> : <Camera className="h-10 w-10" />}
                <span className="sr-only">Upload Avatar</span>
              </Label>
              <Input
                id="avatar-upload"
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
                disabled={isUploading}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="firstName" className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2 block">First Name</Label>
            <Input
              id="firstName"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="w-full p-3 border-2 border-border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all duration-200 bg-background dark:bg-gray-700 text-foreground dark:text-gray-100"
            />
          </div>

          <div>
            <Label htmlFor="lastName" className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2 block">Last Name</Label>
            <Input
              id="lastName"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="w-full p-3 border-2 border-border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all duration-200 bg-background dark:bg-gray-700 text-foreground dark:text-gray-100"
            />
          </div>

          <Button type="submit" className="w-full py-3 text-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors duration-200" disabled={isSaving || isUploading}>
            {isSaving ? <Spinner size="sm" className="mr-2" /> : null}
            {isSaving ? 'Saving...' : 'Save Profile'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default Profile;