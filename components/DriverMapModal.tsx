import React, { useEffect, useRef, useState } from 'react';
import { ensureMapbox, getRoute } from '../services/mapboxService';

interface DriverMapModalProps {
    clientLocation: { lat: number; lng: number };
    driverLocation: { lat: number; lng: number };
    onClose: () => void;
}

const DRIVER_PIN = '<svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="16" fill="#111B21" stroke="#2563EB" stroke-width="4"/><circle cx="20" cy="20" r="5" fill="white"/></svg>';
const CLIENT_PIN = '<svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="16" fill="#111B21" stroke="#25D366" stroke-width="4"/><circle cx="20" cy="20" r="5" fill="white"/></svg>';

const makeEl = (html: string): HTMLDivElement => {
    const el = document.createElement('div');
    el.style.width = '32px';
    el.style.height = '32px';
    el.innerHTML = html;
    return el;
};

export const DriverMapModal: React.FC<DriverMapModalProps> = ({ clientLocation, driverLocation, onClose }) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<any>(null);
    const [distance, setDistance] = useState<string>('');
    const [duration, setDuration] = useState<string>('');
    const [error, setError] = useState<string>('');

    useEffect(() => {
        let cancelled = false;
        ensureMapbox().then((mapboxgl) => {
            if (cancelled || !mapRef.current || mapInstance.current) return;
            try {
                const map = new mapboxgl.Map({
                    container: mapRef.current,
                    style: 'mapbox://styles/mapbox/dark-v11',
                    center: [driverLocation.lng, driverLocation.lat],
                    zoom: 13,
                    attributionControl: false,
                });
                mapInstance.current = map;

                new mapboxgl.Marker({ element: makeEl(DRIVER_PIN) })
                    .setLngLat([driverLocation.lng, driverLocation.lat]).addTo(map);
                new mapboxgl.Marker({ element: makeEl(CLIENT_PIN) })
                    .setLngLat([clientLocation.lng, clientLocation.lat]).addTo(map);

                map.on('load', async () => {
                    setTimeout(() => map.resize(), 200);
                    const route = await getRoute(driverLocation, clientLocation);
                    if (!route || !route.geometry || cancelled) {
                        setError('Erro ao traçar rota.');
                        return;
                    }
                    map.addSource('route', {
                        type: 'geojson',
                        data: { type: 'Feature', properties: {}, geometry: route.geometry },
                    });
                    map.addLayer({
                        id: 'route-line',
                        type: 'line',
                        source: 'route',
                        layout: { 'line-join': 'round', 'line-cap': 'round' },
                        paint: { 'line-color': '#00a884', 'line-width': 6 },
                    });
                    setDistance(route.distanceText);
                    setDuration(route.durationText);

                    const coords = route.geometry.coordinates;
                    const bounds = coords.reduce(
                        (b: any, c: [number, number]) => b.extend(c),
                        new mapboxgl.LngLatBounds(coords[0], coords[0])
                    );
                    map.fitBounds(bounds, { padding: 70, duration: 600 });
                });
            } catch (e) {
                console.error('Map initialization error', e);
                setError('Erro ao inicializar o mapa.');
            }
        });
        return () => {
            cancelled = true;
            if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
        };
    }, [clientLocation, driverLocation]);

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col animate-fade-in">
            <div className="bg-whatsapp-panel p-4 flex items-center justify-between shadow-md z-10">
                <div className="flex flex-col">
                    <h2 className="text-white font-bold text-lg">Rota até o Cliente</h2>
                    {distance && duration && (
                        <span className="text-whatsapp-green text-sm font-mono">{distance} • {duration}</span>
                    )}
                    {error && <span className="text-red-500 text-xs">{error}</span>}
                </div>
                <button onClick={onClose} className="p-2 bg-gray-700 rounded-full text-white hover:bg-gray-600 transition">
                    <span className="material-icons">close</span>
                </button>
            </div>

            <div className="flex-1 relative">
                <div ref={mapRef} className="w-full h-full" />
                <a
                    href={`https://www.google.com/maps/dir/?api=1&origin=${driverLocation.lat},${driverLocation.lng}&destination=${clientLocation.lat},${clientLocation.lng}&travelmode=driving`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-6 right-6 bg-blue-600 text-white p-4 rounded-full shadow-lg flex items-center gap-2 hover:bg-blue-700 transition animate-bounce"
                >
                    <span className="material-icons">navigation</span>
                    <span className="font-bold">Navegar</span>
                </a>
            </div>
        </div>
    );
};
