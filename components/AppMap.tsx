
import React, { useEffect, useRef, useState } from 'react';
import { UserProfile, AppSettings } from '../types';
import { ensureMapbox, getRoute, LatLng } from '../services/mapboxService';

interface AppMapProps {
    drivers: UserProfile[];
    userLocation?: { lat: number, lng: number };
    onMarkerClick?: (driver: UserProfile) => void;
    settings?: AppSettings | null;
    routeOrigin?: { lat: number, lng: number };
    routeDestination?: { lat: number, lng: number };
    showRoute?: boolean;
    navigationMode?: boolean; // Modo navegação (câmera inclinada e seguindo)
    onRouteInfo?: (info: { distance: string; duration: string }) => void;
}

const LIGHT_STYLE = 'mapbox://styles/mapbox/streets-v12';

const CAR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" height="40" viewBox="0 0 24 24" width="40"><path d="M0 0h24v24H0z" fill="none"/><path fill="#25D366" stroke="#111b21" stroke-width="0.5" d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>';
const MOTO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" height="40" viewBox="0 0 24 24" width="40"><path d="M0 0h24v24H0z" fill="none"/><path fill="#FFA500" stroke="#111b21" stroke-width="0.5" d="M20 6c0-1.1-.9-2-2-2s-2 .9-2 2 .9 2 2 2 2-.9 2-2zm-5 10c0-2.76-2.24-5-5-5s-5 2.24-5 5 2.24 5 5 5 5-2.24 5-5zm-5 3c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/></svg>';

// Cria um elemento DOM para usar como marcador customizado
const makeIconEl = (html: string, size = 40): HTMLDivElement => {
    const el = document.createElement('div');
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.innerHTML = html;
    return el;
};
const makeImgEl = (url: string, size = 40): HTMLDivElement => {
    const el = document.createElement('div');
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    const img = document.createElement('img');
    img.src = url;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    el.appendChild(img);
    return el;
};

const START_PIN = '<svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="16" fill="#111B21" stroke="#25D366" stroke-width="4"/><circle cx="20" cy="20" r="5" fill="white"/></svg>';
const END_PIN = '<svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="32" height="32" rx="8" fill="#111B21" stroke="#FF4444" stroke-width="4"/><path d="M14 10V30M14 12C14 12 17 10 20 10C23 10 26 14 29 14V22C29 22 26 18 23 18C20 18 17 22 14 22" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const USER_ARROW = '<svg width="34" height="34" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12,2L4.5,20.29L5.21,21L12,18L18.79,21L19.5,20.29L12,2Z" fill="#2563eb" stroke="#ffffff" stroke-width="1.5"/></svg>';

export const AppMap: React.FC<AppMapProps> = ({
    drivers,
    userLocation,
    onMarkerClick,
    settings,
    routeOrigin,
    routeDestination,
    showRoute = false,
    navigationMode = false,
    onRouteInfo
}) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<any>(null);
    const mapLoaded = useRef(false);
    const markers = useRef<Map<string, any>>(new Map());

    const userMarker = useRef<any>(null);
    const startMarker = useRef<any>(null);
    const endMarker = useRef<any>(null);
    const lastRouteCoords = useRef<string>('');
    const lastPosKey = useRef<string>('');
    const [isFollowing, setIsFollowing] = useState(true);
    const [ready, setReady] = useState(false);

    // ── Inicialização do mapa ────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        ensureMapbox().then((mapboxgl) => {
            if (cancelled || !mapRef.current || mapInstance.current) return;

            const center = userLocation || { lat: -3.7319, lng: -38.5267 };
            const map = new mapboxgl.Map({
                container: mapRef.current,
                style: LIGHT_STYLE,
                center: [center.lng, center.lat],
                zoom: 15,
                attributionControl: false,
            });
            mapInstance.current = map;

            // Para de seguir quando o usuário interage manualmente
            const stopFollowing = () => setIsFollowing(false);
            map.on('dragstart', stopFollowing);
            map.on('wheel', stopFollowing);

            map.on('load', () => {
                mapLoaded.current = true;
                setReady(true);
                setTimeout(() => map.resize(), 300);
            });
        });
        return () => {
            cancelled = true;
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
                mapLoaded.current = false;
            }
        };
    }, []);

    // ── Marcadores dos motoristas ────────────────────────────────────────────
    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !ready) return;
        const mapboxgl = (window as any).mapboxgl;

        const currentIds = new Set(drivers.map(d => d.id));
        markers.current.forEach((marker, id) => {
            if (!currentIds.has(id)) {
                marker.remove();
                markers.current.delete(id);
            }
        });

        drivers.forEach(driver => {
            if (driver.lat && driver.lng) {
                const pos: [number, number] = [driver.lng, driver.lat];
                let marker = markers.current.get(driver.id);
                if (marker) {
                    marker.setLngLat(pos);
                } else {
                    const isMoto = driver.vehicle_type === 'motorcycle';
                    const customUrl = isMoto ? settings?.moto_icon_url : settings?.car_icon_url;
                    const el = customUrl ? makeImgEl(customUrl) : makeIconEl(isMoto ? MOTO_SVG : CAR_SVG);
                    el.style.cursor = 'pointer';
                    el.addEventListener('click', () => onMarkerClick && onMarkerClick(driver));
                    marker = new mapboxgl.Marker({ element: el })
                        .setLngLat(pos)
                        .addTo(map);
                    markers.current.set(driver.id, marker);
                }
            }
        });
    }, [drivers, ready, settings]);

    // ── Rota + marcadores de origem/destino ──────────────────────────────────
    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !ready) return;
        const mapboxgl = (window as any).mapboxgl;

        const clearRoute = () => {
            if (map.getLayer('route-line')) map.removeLayer('route-line');
            if (map.getSource('route')) map.removeSource('route');
            if (startMarker.current) { startMarker.current.remove(); startMarker.current = null; }
            if (endMarker.current) { endMarker.current.remove(); endMarker.current = null; }
            lastRouteCoords.current = '';
        };

        if (showRoute && routeOrigin && routeDestination) {
            // Marcadores de origem/destino
            if (!startMarker.current) {
                startMarker.current = new mapboxgl.Marker({ element: makeIconEl(START_PIN, 32) })
                    .setLngLat([routeOrigin.lng, routeOrigin.lat]).addTo(map);
            } else {
                startMarker.current.setLngLat([routeOrigin.lng, routeOrigin.lat]);
            }
            if (!endMarker.current) {
                endMarker.current = new mapboxgl.Marker({ element: makeIconEl(END_PIN, 32) })
                    .setLngLat([routeDestination.lng, routeDestination.lat]).addTo(map);
            } else {
                endMarker.current.setLngLat([routeDestination.lng, routeDestination.lat]);
            }

            // Só recalcula a rota se mudou mais de ~100m
            const key = `${routeOrigin.lat.toFixed(3)},${routeOrigin.lng.toFixed(3)}-${routeDestination.lat.toFixed(3)},${routeDestination.lng.toFixed(3)}`;
            if (key === lastRouteCoords.current) return;
            lastRouteCoords.current = key;

            const distApprox = Math.abs(routeOrigin.lat - routeDestination.lat) + Math.abs(routeOrigin.lng - routeDestination.lng);
            if (distApprox < 0.0001) {
                if (onRouteInfo) onRouteInfo({ distance: 'No local', duration: '0 min' });
                return;
            }

            getRoute(routeOrigin as LatLng, routeDestination as LatLng).then((route) => {
                if (!route || !route.geometry || !mapInstance.current) return;
                const geojson = { type: 'Feature', properties: {}, geometry: route.geometry };

                if (map.getSource('route')) {
                    (map.getSource('route') as any).setData(geojson);
                } else {
                    map.addSource('route', { type: 'geojson', data: geojson });
                    map.addLayer({
                        id: 'route-line',
                        type: 'line',
                        source: 'route',
                        layout: { 'line-join': 'round', 'line-cap': 'round' },
                        paint: { 'line-color': '#25D366', 'line-width': 6, 'line-opacity': 0.9 },
                    });
                }

                // Ajusta o enquadramento para mostrar a rota inteira (fora do modo navegação)
                if (!navigationMode) {
                    const coords = route.geometry.coordinates;
                    const bounds = coords.reduce(
                        (b: any, c: [number, number]) => b.extend(c),
                        new mapboxgl.LngLatBounds(coords[0], coords[0])
                    );
                    map.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 600 });
                }

                if (onRouteInfo) onRouteInfo({ distance: route.distanceText, duration: route.durationText });
            });
        } else {
            clearRoute();
        }
    }, [showRoute, routeOrigin, routeDestination, ready, navigationMode]);

    // ── Marcador do usuário + câmera de navegação ────────────────────────────
    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !userLocation || !ready) return;
        const mapboxgl = (window as any).mapboxgl;

        const key = `${userLocation.lat.toFixed(5)},${userLocation.lng.toFixed(5)},${navigationMode},${isFollowing}`;
        if (key === lastPosKey.current) return;
        lastPosKey.current = key;

        const pos: [number, number] = [userLocation.lng, userLocation.lat];
        if (userMarker.current) {
            userMarker.current.setLngLat(pos);
        } else {
            userMarker.current = new mapboxgl.Marker({ element: makeIconEl(USER_ARROW, 34) })
                .setLngLat(pos).addTo(map);
        }

        if (isFollowing) {
            if (navigationMode) {
                map.easeTo({ center: pos, zoom: 18, pitch: 50, duration: 800 });
            } else {
                map.easeTo({ center: pos, duration: 600 });
            }
        }
    }, [userLocation, navigationMode, isFollowing, ready]);

    return (
        <div className="w-full h-full relative">
            <div ref={mapRef} className="w-full h-full" />

            {/* Indicador de estado */}
            <div className={`absolute top-4 left-4 bg-black/60 backdrop-blur-md text-white text-[10px] px-4 py-2 rounded-full uppercase font-black tracking-widest border border-white/10 transition-all z-10 ${navigationMode ? 'bg-blue-600' : ''}`}>
                {navigationMode ? (isFollowing ? 'Navegação Ativa' : 'Pausado') : 'GPS Ativo'}
            </div>

            {/* Botão Re-centralizar */}
            {!isFollowing && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[30] animate-bounce-short">
                    <button
                        onClick={() => setIsFollowing(true)}
                        className="bg-blue-600 text-white px-8 py-3 rounded-full shadow-2xl font-black text-xs uppercase tracking-widest border border-white/20 flex items-center gap-2 active:scale-95 transition"
                    >
                        <span className="material-icons text-base">navigation</span>
                        Re-centralizar
                    </button>
                </div>
            )}

            {/* Atalho para navegação externa */}
            {navigationMode && routeDestination && (
                <div className="absolute top-[280px] left-4 z-20">
                    <button
                        onClick={() => {
                            const url = `https://www.google.com/maps/dir/?api=1&origin=${userLocation?.lat},${userLocation?.lng}&destination=${routeDestination.lat},${routeDestination.lng}&travelmode=driving`;
                            window.open(url, '_blank');
                        }}
                        className="pointer-events-auto bg-blue-600/90 backdrop-blur-md text-white p-3 rounded-2xl shadow-xl flex items-center gap-2 transition active:scale-95 border border-white/10"
                    >
                        <span className="material-icons text-xl">navigation</span>
                        <div className="flex flex-col items-start pr-1">
                            <span className="text-[10px] uppercase font-black leading-none mb-0.5 tracking-tighter">MAPS</span>
                            <span className="text-[12px] font-bold leading-none uppercase">Externo</span>
                        </div>
                    </button>
                </div>
            )}
        </div>
    );
};
