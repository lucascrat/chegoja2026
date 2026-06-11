import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';

const FCM_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-notification`;

export interface NotificationResult {
    success: boolean;
    sent?: number;
    failed?: number;
    total?: number;
    error?: string;
}

/**
 * Send notification via Supabase Edge Function
 */
export async function sendNotification(
    title: string,
    body: string,
    targetType: 'all' | 'drivers' | 'clients' | 'user' | 'nearby_drivers',
    {
        targetUserId,
        imageUrl,
        sound,
        data,
        originLat,
        originLng,
        radiusKm
    }: {
        targetUserId?: string,
        imageUrl?: string,
        sound?: string,
        data?: Record<string, string>,
        // Para targetType 'nearby_drivers': só motoristas dentro do raio recebem o push
        originLat?: number,
        originLng?: number,
        radiusKm?: number
    } = {}
): Promise<NotificationResult> {
    try {
        const response = await fetch(FCM_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({
                title,
                body,
                targetType,
                targetUserId,
                imageUrl,
                sound,
                data,
                originLat,
                originLng,
                radiusKm
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('FCM Function Error:', response.status, errorText);
            return {
                success: false,
                error: `Erro ${response.status}: ${errorText || response.statusText}`
            };
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error sending notification:', error);
        return {
            success: false,
            error: error instanceof Error ? `Falha de Conexão: ${error.message}` : 'Erro de rede desconhecido',
        };
    }
}

