// ============================================================================
// Serviço de rotas para o Bot de WhatsApp (server-side / Node).
// Migrado para Mapbox — mantém o nome/forma da API antiga (GoogleMapsService)
// para não quebrar os imports existentes em whatsappBot.ts.
// ============================================================================
import { geocodeAddress, getRoute } from './mapboxService';

interface RouteInfo {
    distanceKm: number;
    durationMins: number;
    startAddress: string;
    endAddress: string;
}

export const GoogleMapsService = {
    // Calcula a rota entre dois endereços em texto (origem → destino)
    calculateRoute: async (origin: string, destination: string): Promise<RouteInfo | null> => {
        try {
            const [o, d] = await Promise.all([
                geocodeAddress(origin),
                geocodeAddress(destination),
            ]);

            if (!o || !d) {
                console.warn('Mapbox: não foi possível geocodificar origem/destino.');
                return null;
            }

            const route = await getRoute(o.location, d.location);
            if (!route) return null;

            return {
                distanceKm: route.distanceKm,
                durationMins: Math.ceil(route.durationMins),
                startAddress: o.address,
                endAddress: d.address,
            };
        } catch (error) {
            console.error('Mapbox calculateRoute error:', error);
            return null;
        }
    }
};
