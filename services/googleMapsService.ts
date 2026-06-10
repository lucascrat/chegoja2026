
import { GOOGLE_MAPS_API_KEY } from '../constants';

interface RouteInfo {
    distanceKm: number;
    durationMins: number;
    startAddress: string;
    endAddress: string;
}

export const GoogleMapsService = {
    // Calculate distance between two text addresses
    calculateRoute: async (origin: string, destination: string): Promise<RouteInfo | null> => {
        if (!GOOGLE_MAPS_API_KEY) {
            console.warn("GOOGLE_MAPS_API_KEY not set. Using mock distance.");
            // Mock for testing without billing
            return {
                distanceKm: 5.5,
                durationMins: 12,
                startAddress: origin,
                endAddress: destination
            };
        }

        try {
            // Using Distance Matrix API (Server-side compatible usually, but here client-side fetch)
            // Note: In a real production app, this should be proxied to avoid exposing key if not restricted.
            // However, this is running in a Node.js context (WAHA Bot), so it is safer than browser.
            const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.status === 'OK' && data.rows[0].elements[0].status === 'OK') {
                const element = data.rows[0].elements[0];
                return {
                    distanceKm: element.distance.value / 1000,
                    durationMins: Math.ceil(element.duration.value / 60),
                    startAddress: data.origin_addresses[0],
                    endAddress: data.destination_addresses[0]
                };
            }

            console.error("Maps API Error:", data);
            return null;
        } catch (error) {
            console.error("Maps Fetch Error:", error);
            return null;
        }
    }
};
