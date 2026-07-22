// Supabase Edge Function: Send Push Notifications via FCM V1
// Deploy: supabase functions deploy send-notification

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { create } from "https://deno.land/x/djwt@v2.8/mod.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NotificationPayload {
    title: string
    body: string
    data?: Record<string, string>
    targetType: 'all' | 'drivers' | 'clients' | 'user' | 'nearby_drivers'
    targetUserId?: string
    imageUrl?: string
    sound?: string
    // Para 'nearby_drivers': só motoristas dentro do raio (km) recebem o push
    originLat?: number
    originLng?: number
    radiusKm?: number
}

// Map sound to channel
function getChannelId(sound?: string): string {
    if (sound === 'ubb') {
        return 'special_alert'
    }
    return 'chegoja_rides'
}

// Send notification to a single token
async function sendToToken(accessToken: string, projectId: string, token: string, notification: any, data: any, sound?: string): Promise<boolean> {
    try {
        const channelId = getChannelId(sound)

        const dataPayload: Record<string, string> = {
            ...data,
            title: notification.title,
            body: notification.body,
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
            channel_id: channelId,
            sound: sound || 'default',
        }
        if (notification.image) dataPayload.image = notification.image

        const message: any = {
            token: token,
            data: dataPayload,
            android: {
                priority: 'high',
                notification: {
                    channel_id: channelId,
                    notification_priority: 'PRIORITY_MAX',
                    visibility: 'PUBLIC',
                }
            }
        }

        if (data?.type === 'new_ride') {
            message.notification = {
                title: notification.title,
                body: notification.body,
            }
        }

        const response = await fetch(
            `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message })
            }
        )

        const result = await response.json()
        if (!response.ok) {
            console.error(`FCM Error for token ${token.substring(0, 10)}...:`, result)
        } else {
            console.log(`FCM Success for token ${token.substring(0, 10)}...`)
        }
        return response.ok
    } catch (error) {
        console.error('Error sending to token:', error)
        return false
    }
}

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (!supabaseUrl || !supabaseKey) {
            console.error('CRITICAL ERROR: Environment variables SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are missing.')
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'Configuração do servidor incompleta: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos.'
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
            )
        }

        const bodyText = await req.text()
        let payload: any = {}
        try {
            payload = JSON.parse(bodyText)
        } catch (e) {
            console.error('Failed to parse request JSON:', bodyText)
        }

        // Health check / Ping
        if (payload.ping) {
            return new Response(
                JSON.stringify({ success: true, message: 'Pong! Edge Function is online.' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            )
        }

        // Initialize client with 'chegoja' schema
        const supabase = createClient(supabaseUrl, supabaseKey, {
            db: { schema: 'chegoja' }
        })

        // 1. Fetch Firebase Credentials
        let source = 'NONE';
        let fbProjectIdFinal: string | undefined;
        let fbEmailFinal: string | undefined;
        let fbKeyFinal: string | undefined;

        // Try base64-encoded JSON service account first (safe for .env)
        const fbServiceAccountB64 = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_B64');
        if (fbServiceAccountB64) {
            try {
                const json = JSON.parse(atob(fbServiceAccountB64));
                fbProjectIdFinal = json.project_id;
                fbEmailFinal = json.client_email;
                fbKeyFinal = json.private_key;
                source = 'ENV (FIREBASE_SERVICE_ACCOUNT_B64)';
            } catch (e) {
                console.error('[DEBUG] Failed to parse FIREBASE_SERVICE_ACCOUNT_B64:', e);
            }
        }

        // Fallback to individual env vars
        if (!fbKeyFinal) {
            fbProjectIdFinal = Deno.env.get('FIREBASE_PROJECT_ID');
            fbEmailFinal = Deno.env.get('FIREBASE_CLIENT_EMAIL');
            fbKeyFinal = Deno.env.get('FIREBASE_PRIVATE_KEY');
            if (fbKeyFinal) source = 'ENV (.env)';
        }

        // Fallback to database
        if (!fbKeyFinal) {
            console.log('[DEBUG] No key in ENV. Checking app_secrets table...');
            const { data: secretsData } = await supabase
                .from('app_secrets')
                .select('key, value')
                .in('key', ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']);

            if (secretsData) {
                source = 'DATABASE (app_secrets)';
                const secrets: Record<string, string> = {};
                secretsData.forEach(s => secrets[s.key] = s.value);
                fbProjectIdFinal = secrets['FIREBASE_PROJECT_ID'];
                fbEmailFinal = secrets['FIREBASE_CLIENT_EMAIL'];
                fbKeyFinal = secrets['FIREBASE_PRIVATE_KEY'];
            }
        }

        const fbEmail = fbEmailFinal;
        const fbKey = fbKeyFinal;
        const fbProjectId = fbProjectIdFinal || 'chegoja-pro';

        console.log(`[DEBUG] Using Firebase credentials from: ${source}`);
        if (fbKey) console.log(`[DEBUG] Raw Key Length: ${fbKey.length}`);

        if (!fbEmail || !fbKey) {
            throw new Error(`Credenciais não encontradas. Fonte: ${source}`);
        }

        const { title, body, data, targetType, targetUserId, imageUrl, sound, originLat, originLng, radiusKm } = payload as NotificationPayload

        if (!title || !body || !targetType) {
            throw new Error('Missing required fields: title, body, targetType')
        }

        // Get tokens based on target type
        let tokens: any[] | null = null
        let tokensError: any = null

        if (targetType === 'nearby_drivers' && typeof originLat === 'number' && typeof originLng === 'number') {
            // Apenas motoristas dentro do raio da origem da corrida
            const result = await supabase
                .rpc('get_push_tokens_nearby', {
                    origin_lat: originLat,
                    origin_lng: originLng,
                    radius_km: radiusKm || 10
                })
            tokens = result.data
            tokensError = result.error
            console.log(`[Radius] nearby_drivers em ${radiusKm || 10}km de (${originLat}, ${originLng}): ${tokens?.length || 0} tokens`)
        } else {
            // 'nearby_drivers' sem coordenadas cai no comportamento antigo (todos os motoristas)
            const effectiveType = targetType === 'nearby_drivers' ? 'drivers' : targetType
            const result = await supabase
                .rpc('get_push_tokens', {
                    target_type: effectiveType,
                    target_user_id: targetUserId || null
                })
            tokens = result.data
            tokensError = result.error
        }

        if (tokensError) {
            console.error('Error fetching tokens:', tokensError)
            throw tokensError
        }

        if (!tokens || tokens.length === 0) {
            console.log(`No tokens found for target: ${targetType} ${targetUserId || ''}`)
            return new Response(
                JSON.stringify({ success: true, message: 'No tokens found', sent: 0 }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        console.log(`Found ${tokens.length} tokens for target: ${targetType}`)

        // 2. Generate Access Token for FCM V1 (Ultra-Safe Cleaning)
        const cleanKey = (key: string) => {
            // Remove PEM headers and footers with a robust regex
            let cleaned = key.replace(/-----[\s\w]*PRIVATE KEY-----/g, '');

            // Remove literal \n escapes
            cleaned = cleaned.replace(/\\n/g, '');

            // Remove ANY whitespace (newlines, tabs, spaces)
            cleaned = cleaned.replace(/\s+/g, '');

            // Keep ONLY valid Base64 characters
            cleaned = cleaned.replace(/[^A-Za-z0-9+/=]/g, '');

            return cleaned.trim();
        }

        const keyData = cleanKey(fbKey);
        console.log(`[DEBUG] Final Cleaned Key Length: ${keyData.length}`);
        console.log(`[Debug] Cleaned key length: ${keyData.length} characters.`);

        let binaryKey;
        try {
            binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0))
        } catch (e) {
            console.error(`Base64 Decoding Failed. Length: ${keyData.length}. Sample: ${keyData.substring(0, 30)}...`)
            throw new Error(`Erro ao decodificar a chave privada. Detalhe: ${e.message}`)
        }

        const cryptoKey = await crypto.subtle.importKey(
            'pkcs8',
            binaryKey,
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            false,
            ['sign']
        )

        const now = Math.floor(Date.now() / 1000)
        const jwtPayload = {
            iss: fbEmail,
            sub: fbEmail,
            aud: 'https://oauth2.googleapis.com/token',
            iat: now,
            exp: now + 3600,
            scope: 'https://www.googleapis.com/auth/firebase.messaging'
        }

        const jwt = await create({ alg: 'RS256', typ: 'JWT' }, jwtPayload, cryptoKey)
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion: jwt
            })
        })

        const fbTokenData = await tokenResponse.json()
        if (!fbTokenData.access_token) {
            console.error('OAuth2 Error:', fbTokenData)
            throw new Error(`Failed to get FCM access token: ${fbTokenData.error_description || fbTokenData.error}`)
        }

        const accessToken = fbTokenData.access_token

        // Prepare notification payload
        const notification = {
            title,
            body,
            ...(imageUrl ? { image: imageUrl } : {})
        }

        const notificationData = {
            ...data,
            title,
            body,
            click_action: 'FLUTTER_NOTIFICATION_CLICK'
        }

        // Send to all tokens — em lotes paralelos (evita demora com muitos motoristas)
        const BATCH_SIZE = 50
        let successCount = 0
        let failCount = 0

        for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
            const batch = tokens.slice(i, i + BATCH_SIZE)
            const results = await Promise.all(
                batch.map((tokenInfo: any) =>
                    sendToToken(accessToken, fbProjectId, tokenInfo.token, notification, notificationData, sound)
                )
            )
            for (const success of results) {
                if (success) successCount++
                else failCount++
            }
        }

        // Log notification in database
        try {
            const authHeader = req.headers.get('Authorization')
            let senderId = null

            if (authHeader) {
                const { data: userData } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
                senderId = userData?.user?.id
            }

            await supabase.from('notifications').insert({
                title,
                body,
                data: data || {},
                target_type: targetType,
                target_user_id: targetUserId || null,
                sent_by: senderId,
                sent_count: successCount
            })
        } catch (logError) {
            console.warn('Silent fail: Could not log notification to DB:', logError)
        }

        return new Response(
            JSON.stringify({
                success: true,
                sent: successCount,
                failed: failCount,
                total: tokens.length
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Edge Function Error:', error)
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }
})
