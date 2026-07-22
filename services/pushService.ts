// Push Notifications Service using Firebase Cloud Messaging
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabaseClient';
import { soundService } from './soundService';

class PushNotificationService {
    private isInitialized = false;
    private currentUserId: string | null = null;

    // Initialize push notifications for a user
    async initialize(userId: string): Promise<boolean> {
        if (this.isInitialized && this.currentUserId === userId) {
            return true;
        }

        this.currentUserId = userId;

        if (Capacitor.isNativePlatform()) {
            return this.initializeNative(userId);
        }

        return this.initializeWeb(userId);
    }

    private async initializeNative(userId: string): Promise<boolean> {
        console.log('[Push] Initializing native for user:', userId);

        try {
            await PushNotifications.removeAllListeners();

            PushNotifications.addListener('registration', async (token) => {
                console.log('[Push] Token recebido via listener');
                await this.saveToken(userId, token.value, 'android');
            });

            PushNotifications.addListener('registrationError', (error) => {
                console.error('[Push] Registration error:', error.error);
            });

            PushNotifications.addListener('pushNotificationReceived', (notification) => {
                console.log('[Push] Notification received in foreground:', notification);
                soundService.playReceived();
                this.handleNotification(notification);
            });

            PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
                console.log('[Push] Notification action performed:', notification);
                this.handleNotificationAction(notification);
            });

            const permResult = await PushNotifications.requestPermissions();
            if (permResult.receive !== 'granted') {
                console.log('[Push] Permission not granted');
                return false;
            }

            if (import.meta.env.VITE_ENABLE_PUSH === 'true') {
                await PushNotifications.register();
            }

            if (Capacitor.getPlatform() === 'android') {
                await PushNotifications.createChannel({
                    id: 'chegoja_rides',
                    name: 'Corridas e Alertas',
                    description: 'Notificacoes de novas corridas e alertas do sistema',
                    importance: 5,
                    visibility: 1,
                    sound: 'default',
                    vibration: true
                });
                await PushNotifications.createChannel({
                    id: 'special_alert',
                    name: 'Alertas Especiais',
                    description: 'Alertas com som personalizado',
                    importance: 5,
                    visibility: 1,
                    sound: 'ubb',
                    vibration: true
                });
            }

            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('[Push] Native init failed:', error);
            return false;
        }
    }

    private async initializeWeb(userId: string): Promise<boolean> {
        console.log('[Push] Initializing web push for user:', userId);

        try {
            if (!('Notification' in window) || !('serviceWorker' in navigator)) {
                console.log('[Push] Web Push not supported');
                return false;
            }

            const perm = await Notification.requestPermission();
            if (perm !== 'granted') {
                console.log('[Push] Web notification permission denied');
                return false;
            }

            const { getMessaging, getToken, onMessage } = await import('firebase/messaging');
            const { app } = await import('./firebase');

            const messaging = getMessaging(app);

            const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
            console.log('[Push] SW registered');

            const fcmToken = await getToken(messaging, {
                vapidKey: 'BIN6KGE5w7Gvf6NFzA4IsCbYQ2UecFzxQpVH5HcA4-dDmh7G_Z-LmE9BGLoQVQZ8xNDsbq6L5wYZ-0mPYHV5K5Y',
                serviceWorkerRegistration: reg,
            });

            if (fcmToken) {
                await this.saveToken(userId, fcmToken, 'web');
            }

            onMessage(messaging, (payload) => {
                console.log('[Push] Web foreground message:', payload);
                const data = payload.data as Record<string, string> || {};
                if (data.type === 'new_ride' && window.Android?.triggerNativeAlert) {
                    window.Android.triggerNativeAlert();
                }
            });

            this.isInitialized = true;
            console.log('[Push] Web init complete');
            return true;
        } catch (error) {
            console.error('[Push] Web init failed:', error);
            return false;
        }
    }

    // Save FCM token to database
    private async saveToken(userId: string, token: string, platform: string): Promise<void> {
        try {
            console.log('[Push] Saving token for user:', userId);

            const { data, error } = await supabase
                .from('push_tokens')
                .upsert({
                    user_id: userId,
                    token: token,
                    platform: platform,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'user_id'
                })
                .select();

            if (error) {
                console.error('[Push] Token Registration ERROR:', JSON.stringify(error, null, 2));
            } else {
                console.log('[Push] Token Registered Successfully!');
            }
        } catch (error: any) {
            console.error('[Push] CRITICAL EXCEPTION in saveToken:', error?.message || error);
        }
    }

    // Handle incoming notification when app is open
    private handleNotification(notification: any): void {
        // You can display a custom in-app notification here
        // For now, just log it
        console.log('[Push] Notification data:', {
            title: notification.title,
            body: notification.body,
            data: notification.data
        });

        // Trigger native alert if it's a ride notification
        if (notification.data?.type === 'new_ride' && window.Android?.triggerNativeAlert) {
            window.Android.triggerNativeAlert();
        }
    }

    // Handle notification tap action
    private handleNotificationAction(action: any): void {
        const data = action.notification?.data;

        if (data?.type === 'new_ride' && data?.ride_id) {
            // Navigate to ride screen
            console.log('[Push] Should navigate to ride:', data.ride_id);
            // You can dispatch an event here to navigate
            window.dispatchEvent(new CustomEvent('openRide', { detail: { rideId: data.ride_id } }));
        }
    }

    // Remove token on logout
    async removeToken(userId: string): Promise<void> {
        try {
            const { error } = await supabase
                .from('push_tokens')
                .delete()
                .eq('user_id', userId);

            if (error) {
                console.error('[Push] Error removing token:', error);
            } else {
                console.log('[Push] Token removed');
            }
        } catch (error) {
            console.error('[Push] Error removing token:', error);
        }
    }
}

export const pushService = new PushNotificationService();
