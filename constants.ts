// Leitura das variáveis de ambiente (Vite)
// Os valores de fallback existem APENAS para evitar crash do createClient
// em builds sem .env. Em produção, sempre use .env com as variáveis corretas.

export const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://supabase.appbr.pro';

export const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'eyJhbG...dyQ4';

// O nome da aplicação usado em toda a interface
export const APP_NAME = "ChegoJá";

// EFIBANK: credenciais ficam apenas na Edge Function payment-manager (servidor),
// nunca no bundle do app.

export const GOOGLE_MAPS_API_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';

// EFIBANK: código da conta para o SDK client-side (não é segredo — é usado
// pelo navegador para tokenizar cartão). Onde não houver, o admin define
// via app_settings.efi_account_code no painel.
export const EFI_ACCOUNT_CODE = (import.meta as any).env?.VITE_EFI_ACCOUNT_CODE || '';

// MAPBOX CONFIG — substitui o Google Maps em todo o app (mapa interativo, geocoding, rotas e mapa estático)
export const MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_TOKEN || '';

// RAIO DE CHAMADA: motoristas só recebem corridas dentro deste raio (km).
// Permite operar em várias cidades sem que uma chamada de uma cidade toque na outra.
// Pode ser sobrescrito pelo admin via app_settings.ride_radius_km.
export const DEFAULT_RIDE_RADIUS_KM = 10;

// Distância em linha reta entre dois pontos (Haversine), em km
export const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

// CÉLULAS DE GRADE (~11 km): usadas para filtrar corridas NO SERVIDOR (Realtime).
// A corrida ganha uma célula (trigger no banco) e o motorista só assina eventos
// das células ao redor dele — eventos de outras cidades nem chegam ao aparelho.
// Deve bater com o cálculo do trigger SQL: floor(lat*10) || '_' || floor(lng*10)
export const rideCellOf = (lat: number, lng: number): string =>
    `${Math.floor(lat * 10)}_${Math.floor(lng * 10)}`;

// Célula do ponto + vizinhas suficientes para cobrir o raio de chamada
export const rideCellsAround = (lat: number, lng: number, radiusKm: number): string[] => {
    const n = Math.max(1, Math.ceil(radiusKm / 11));
    const baseLat = Math.floor(lat * 10);
    const baseLng = Math.floor(lng * 10);
    const cells: string[] = [];
    for (let i = -n; i <= n; i++) {
        for (let j = -n; j <= n; j++) {
            cells.push(`${baseLat + i}_${baseLng + j}`);
        }
    }
    return cells;
};

export const DRIVER_PLANS = [
    {
        id: 'plan_24h',
        title: 'Plano Diário',
        description: 'Acesso total por 24 horas',
        price: 10.00,
        days: 1
    },
    {
        id: 'plan_7d',
        title: 'Plano Semanal',
        description: 'Acesso total por 7 dias',
        price: 33.00,
        days: 7
    },
    {
        id: 'plan_15d',
        title: 'Plano Quinzenal',
        description: 'Acesso total por 15 dias',
        price: 66.00,
        days: 15
    },
    {
        id: 'plan_30d',
        title: 'Plano Mensal',
        description: 'Acesso total por 30 dias',
        price: 100.00,
        days: 30
    }
];
