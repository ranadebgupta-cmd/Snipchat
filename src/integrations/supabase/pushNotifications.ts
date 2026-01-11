"use client";

import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core'; // Import Capacitor to get platform
import { supabase } from './client';
import { showSuccess, showError } from '@/utils/toast';

interface DeviceToken {
  id?: string;
  user_id: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
}

// Request notification permissions
export const requestPushNotificationPermissions = async () => {
  try {
    const { receive } = await PushNotifications.requestPermissions();
    if (receive === 'granted') {
      console.log("[PushNotifications] Push notification permissions granted.");
      return true;
    } else {
      console.warn("[PushNotifications] Push notification permissions denied.");
      showError("Push notification permissions denied. You won't receive notifications.");
      return false;
    }
  } catch (error) {
    console.error("[PushNotifications] Error requesting permissions:", error);
    showError("Failed to request push notification permissions.");
    return false;
  }
};

// Register for push notifications and send token to Supabase
export const registerPushNotifications = async (userId: string) => {
  try {
    await PushNotifications.register();
    console.log("[PushNotifications] Device registered for push notifications.");
  } catch (error) {
    console.error("[PushNotifications] Error registering device:", error);
    showError("Failed to register device for push notifications.");
  }
};

// Set up listeners for push notifications
export const setupPushNotificationListeners = (userId: string) => {
  PushNotifications.addListener('registration', async (token) => {
    console.log('[PushNotifications] Push registration success, token:', token.value);
    const platform = Capacitor.getPlatform(); // Get actual platform
    const deviceToken: DeviceToken = {
      user_id: userId,
      token: token.value,
      platform: platform === 'web' ? 'web' : (platform === 'ios' ? 'ios' : 'android'), // Map to defined types
    };

    // Upsert the device token to Supabase
    const { error } = await supabase
      .from('device_tokens')
      .upsert(deviceToken, { onConflict: 'token' }); // Update if token already exists

    if (error) {
      console.error("[PushNotifications] Error saving device token to Supabase:", error);
      showError("Failed to save device token for notifications.");
    } else {
      console.log("[PushNotifications] Device token saved to Supabase.");
    }
  });

  PushNotifications.addListener('registrationError', (error) => {
    console.error('[PushNotifications] Error on registration:', error);
    showError("Error registering for push notifications.");
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('[PushNotifications] Push received:', notification);
    // You can display an in-app notification here if needed
    showSuccess(`New message: ${notification.title || ''} - ${notification.body || ''}`);
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
    console.log('[PushNotifications] Push action performed:', notification);
    // Handle navigation or other actions when user taps notification
    // Example: navigate to the chat screen for the conversation ID in notification.data
  });

  console.log("[PushNotifications] Push notification listeners set up.");
};

// Unregister from push notifications (e.g., on logout)
export const unregisterPushNotifications = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('device_tokens')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error("[PushNotifications] Error deleting device token on logout:", error);
    } else {
      console.log("[PushNotifications] Device token removed from Supabase on logout.");
    }
    await PushNotifications.unregister();
    console.log("[PushNotifications] Device unregistered from push notifications.");
  } catch (error) {
    console.error("[PushNotifications] Error unregistering device:", error);
  }
};