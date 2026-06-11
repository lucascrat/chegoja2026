
// Leitura das variáveis de ambiente (Vercel/Vite)
// Se a variável existir (Produção), usa ela. Se não, usa o valor hardcoded (Desenvolvimento/Demo).

export const SUPABASE_URL = 'https://supabase.appbr.pro';

export const SUPABASE_ANON_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4MTA2MzIyMCwiZXhwIjo0OTM2NzM2ODIwLCJyb2xlIjoiYW5vbiJ9.9fcWLR01Jsj6ojWGyGwF7FGGNqEObt13KOAfwdGvbcY';

// O nome da aplicação usado em toda a interface
export const APP_NAME = "ChegoJá";

// EFIBANK CONFIG (GERENCIANET)
export const EFI_CLIENT_ID = "Client_Id_d962c930f4b1bbf4577401c8234a229c94830b8e";
export const EFI_CLIENT_SECRET = "Client_Secret_d0d7f2cbefe1cdc6f658ebc82f5553b75509e336";

// PAGSEGURO CONFIG (Deprecated)
// export const PAGSEGURO_TOKEN = "dbdd0b5b-8f3a-43d2-89a8-718e135ec8301408e62a428f8e14b71e5d408fe230f0cd10-2d62-4ec4-803b-b6fa7981f9bd";

// MERCADO PAGO CONFIG (Deprecated)
// export const MP_PUBLIC_KEY = "APP_USR-8c0ec0f9-7ebd-4f40-aa15-af833ba6c60d";
// export const MP_ACCESS_TOKEN = "APP_USR-1939457864483191-010313-c30b9728ff8f0b7d7766bfa707db2149-166153505";

export const GOOGLE_MAPS_API_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';

// MAPBOX CONFIG — substitui o Google Maps em todo o app (mapa interativo, geocoding, rotas e mapa estático)
export const MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_TOKEN || '';

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