import { MAPBOX_TOKEN } from '../constants';

// ============================================================================
// ChegoJá — Mapbox Service
// Centraliza TODAS as operações de mapa: geocoding (forward/reverse),
// autocomplete de endereços, rotas (Directions) e mapa estático.
// Substitui o antigo Google Maps (Places, Geocoder, Directions, DistanceMatrix).
// ============================================================================

export interface LatLng { lat: number; lng: number; }

// GeoJSON LineString mínimo (evita dependência de @types/geojson)
export interface LineStringGeometry {
    type: 'LineString';
    coordinates: [number, number][];
}

export interface RouteResult {
    distanceKm: number;
    durationMins: number;
    // Texto formatado pt-BR (ex: "5,4 km", "12 min")
    distanceText: string;
    durationText: string;
    // Geometria GeoJSON (LineString) para desenhar no mapa
    geometry: LineStringGeometry | null;
}

export interface AddressSuggestion {
    description: string;     // Texto completo do endereço
    placeId: string;         // mapbox id (para detalhes) — aqui já vem com coords
    location: LatLng;        // Mapbox já retorna coordenadas na busca
    isHistory?: boolean;
}

const GEOCODE_BASE = 'https://api.mapbox.com/search/geocode/v6';
const DIRECTIONS_BASE = 'https://api.mapbox.com/directions/v5/mapbox/driving';

const fmtKm = (km: number) => `${km.toFixed(1).replace('.', ',')} km`;
const fmtMin = (min: number) => `${Math.round(min)} min`;

// ── Garante que o Mapbox GL JS esteja carregado e com o token configurado ──
export const ensureMapbox = (): Promise<any> => {
    return new Promise((resolve) => {
        const apply = () => {
            (window as any).mapboxgl.accessToken = MAPBOX_TOKEN;
            resolve((window as any).mapboxgl);
        };
        if ((window as any).mapboxgl) {
            apply();
        } else {
            const onLoad = () => { window.removeEventListener('mapbox-loaded', onLoad); apply(); };
            window.addEventListener('mapbox-loaded', onLoad);
            // Fallback de polling caso o evento já tenha disparado
            const poll = setInterval(() => {
                if ((window as any).mapboxgl) { clearInterval(poll); apply(); }
            }, 200);
        }
    });
};

// ── Autocomplete de endereços (forward geocoding com autocomplete) ──────────
export const searchAddresses = async (
    query: string,
    proximity?: LatLng
): Promise<AddressSuggestion[]> => {
    if (!query || query.trim().length < 3) return [];
    try {
        const params = new URLSearchParams({
            q: query,
            access_token: MAPBOX_TOKEN,
            language: 'pt',
            country: 'br',
            autocomplete: 'true',
            limit: '6',
        });
        if (proximity) params.set('proximity', `${proximity.lng},${proximity.lat}`);

        const res = await fetch(`${GEOCODE_BASE}/forward?${params.toString()}`);
        const data = await res.json();
        if (!data.features) return [];

        return data.features.map((f: any): AddressSuggestion => ({
            description: f.properties.full_address || f.properties.name || '',
            placeId: f.id || f.properties.mapbox_id || '',
            location: {
                lng: f.geometry.coordinates[0],
                lat: f.geometry.coordinates[1],
            },
        }));
    } catch (e) {
        console.error('Mapbox searchAddresses error:', e);
        return [];
    }
};

// ── Geocoding direto: endereço em texto → coordenadas + endereço formatado ──
export const geocodeAddress = async (address: string): Promise<{ location: LatLng; address: string } | null> => {
    try {
        const params = new URLSearchParams({
            q: address,
            access_token: MAPBOX_TOKEN,
            language: 'pt',
            country: 'br',
            limit: '1',
        });
        const res = await fetch(`${GEOCODE_BASE}/forward?${params.toString()}`);
        const data = await res.json();
        const f = data.features?.[0];
        if (!f) return null;
        return {
            location: { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] },
            address: f.properties.full_address || f.properties.name || address,
        };
    } catch (e) {
        console.error('Mapbox geocodeAddress error:', e);
        return null;
    }
};

// ── Geocoding reverso: coordenadas → endereço formatado ─────────────────────
export const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
    try {
        const params = new URLSearchParams({
            longitude: String(lng),
            latitude: String(lat),
            access_token: MAPBOX_TOKEN,
            language: 'pt',
            limit: '1',
        });
        const res = await fetch(`${GEOCODE_BASE}/reverse?${params.toString()}`);
        const data = await res.json();
        const f = data.features?.[0];
        if (!f) return null;
        return f.properties.full_address || f.properties.name || null;
    } catch (e) {
        console.error('Mapbox reverseGeocode error:', e);
        return null;
    }
};

// ── Rota dirigível entre dois pontos (substitui DirectionsService) ──────────
export const getRoute = async (origin: LatLng, destination: LatLng): Promise<RouteResult | null> => {
    try {
        const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
        const params = new URLSearchParams({
            access_token: MAPBOX_TOKEN,
            geometries: 'geojson',
            overview: 'full',
            language: 'pt',
            steps: 'false',
        });
        const res = await fetch(`${DIRECTIONS_BASE}/${coords}?${params.toString()}`);
        const data = await res.json();
        const route = data.routes?.[0];
        if (!route) return null;

        const distanceKm = route.distance / 1000;
        const durationMins = route.duration / 60;
        return {
            distanceKm,
            durationMins,
            distanceText: fmtKm(distanceKm),
            durationText: fmtMin(durationMins),
            geometry: route.geometry as LineStringGeometry,
        };
    } catch (e) {
        console.error('Mapbox getRoute error:', e);
        return null;
    }
};

// ── Distância/tempo entre dois pontos (substitui DistanceMatrixService) ─────
// Usa a Directions API porque o app sempre calcula 1 origem → 1 destino.
export const getDistance = async (origin: LatLng, destination: LatLng): Promise<{ distanceKm: number; durationMins: number } | null> => {
    const route = await getRoute(origin, destination);
    if (!route) return null;
    return { distanceKm: route.distanceKm, durationMins: route.durationMins };
};

// ── URL de mapa estático (substitui Google Static Maps API) ─────────────────
export const staticMapUrl = (
    lat: number,
    lng: number,
    opts: { zoom?: number; width?: number; height?: number; marker?: boolean } = {}
): string => {
    const { zoom = 15, width = 400, height = 200, marker = true } = opts;
    const overlay = marker ? `pin-s+e74c3c(${lng},${lat})/` : '';
    return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlay}${lng},${lat},${zoom},0/${width}x${height}@2x?access_token=${MAPBOX_TOKEN}`;
};
