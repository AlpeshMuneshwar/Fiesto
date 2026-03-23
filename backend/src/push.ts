/**
 * Push notification helper for Expo Push Notifications.
 * 
 * In production, install expo-server-sdk:
 *   npm install expo-server-sdk
 * 
 * For now, this uses a lightweight fetch-based approach to the Expo push API.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushMessage {
    to: string;
    title: string;
    body: string;
    data?: Record<string, any>;
    sound?: string;
}

/**
 * Send push notifications to one or more Expo push tokens.
 * Silently fails on error to avoid breaking order flows.
 */
export async function sendPushNotifications(messages: PushMessage[]): Promise<void> {
    if (messages.length === 0) return;

    try {
        const response = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(messages.map(m => ({
                to: m.to,
                sound: m.sound || 'default',
                title: m.title,
                body: m.body,
                data: m.data || {},
            }))),
        });

        const result = await response.json();
        console.log('[Push Notifications] Sent:', result?.data?.length || 0, 'notifications');
    } catch (error) {
        console.error('[Push Notifications] Failed to send:', error);
    }
}

/**
 * Helper: send push to all staff of a specific role in a cafe
 */
import { prisma } from './prisma';

export async function notifyStaffByRole(cafeId: string, role: string, title: string, body: string, data?: Record<string, any>): Promise<void> {
    const staff = await prisma.user.findMany({
        where: { cafeId, role, isActive: true, pushToken: { not: null } },
        select: { pushToken: true }
    });

    const messages: PushMessage[] = staff
        .filter(s => s.pushToken)
        .map(s => ({
            to: s.pushToken!,
            title,
            body,
            data,
        }));

    await sendPushNotifications(messages);
}
