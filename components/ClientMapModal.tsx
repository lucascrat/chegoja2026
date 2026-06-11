import React, { useEffect, useRef, useState } from 'react';
import { UserProfile } from '../types';
import { supabase } from '../services/supabaseClient';
import { ensureMapbox } from '../services/mapboxService';

interface ClientMapModalProps {
    driver: UserProfile;
    onClose: () => void;
}

export const ClientMapModal: React.FC<ClientMapModalProps> = ({ driver, onClose }) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<any>(null);
    const markerRef = useRef<any>(null);
    const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(
        driver.lat && driver.lng ? { lat: driver.lat, lng: driver.lng } : null
    );
    const [error, setError] = useState<string>('');
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

    useEffect(() => {
        if (!driverLocation) return;
        let cancelled = false;
        ensureMapbox().then((mapboxgl) => {
            if (cancelled || !mapRef.current || mapInstance.current || !driverLocation) return;
            try {
                const map = new mapboxgl.Map({
                    container: mapRef.current,
                    style: 'mapbox://styles/mapbox/dark-v11',
                    center: [driverLocation.lng, driverLocation.lat],
                    zoom: 15,
                    attributionControl: false,
                });
                mapInstance.current = map;
                map.on('load', () => setTimeout(() => map.resize(), 200));

                const emoji = driver.vehicle_type === 'motorcycle' ? '🏍️' : '🚗';
                const el = document.createElement('div');
                el.style.cssText = 'width:48px;height:48px;border-radius:50%;background:#00a884;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:24px;';
                el.textContent = emoji;

                markerRef.current = new mapboxgl.Marker({ element: el })
                    .setLngLat([driverLocation.lng, driverLocation.lat])
                    .addTo(map);
            } catch (e) {
                console.error('Map initialization error', e);
                setError('Erro ao inicializar o mapa.');
            }
        });
        return () => {
            cancelled = true;
            if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
        };
    }, [driverLocation !== null]);

    // Atualizações de localização em tempo real
    useEffect(() => {
        const channel = supabase
            .channel(`driver-location-${driver.id}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'chegoja',
                table: 'profiles',
                filter: `id=eq.${driver.id}`
            }, (payload: any) => {
                const newData = payload.new;
                if (newData.lat && newData.lng) {
                    const newLocation = { lat: newData.lat, lng: newData.lng };
                    setDriverLocation(newLocation);
                    setLastUpdate(new Date());
                    if (markerRef.current) {
                        markerRef.current.setLngLat([newLocation.lng, newLocation.lat]);
                    }
                    if (mapInstance.current) {
                        mapInstance.current.easeTo({ center: [newLocation.lng, newLocation.lat], duration: 800 });
                    }
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [driver.id]);

    if (!driverLocation) {
        return (
            <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
                <div className="bg-whatsapp-panel p-8 rounded-lg text-center">
                    <span className="material-icons text-6xl text-gray-400 mb-4">location_off</span>
                    <p className="text-white text-lg mb-4">Localização do motorista não disponível</p>
                    <button onClick={onClose} className="bg-whatsapp-green text-white px-6 py-3 rounded-full font-bold">
                        Fechar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col animate-fade-in">
            <div className="bg-whatsapp-panel p-4 flex items-center justify-between shadow-md z-10">
                <div className="flex flex-col">
                    <h2 className="text-white font-bold text-lg flex items-center gap-2">
                        <span className="material-icons">{driver.vehicle_type === 'motorcycle' ? 'two_wheeler' : 'directions_car'}</span>
                        {driver.username}
                    </h2>
                    <span className="text-gray-400 text-xs">
                        Atualizado há {Math.floor((new Date().getTime() - lastUpdate.getTime()) / 1000)}s
                    </span>
                    {error && <span className="text-red-500 text-xs">{error}</span>}
                </div>
                <button onClick={onClose} className="p-2 bg-gray-700 rounded-full text-white hover:bg-gray-600 transition">
                    <span className="material-icons">close</span>
                </button>
            </div>

            <div className="flex-1 relative">
                <div ref={mapRef} className="w-full h-full" />

                <div className="absolute bottom-6 left-6 right-6 bg-whatsapp-panel/95 backdrop-blur-sm p-4 rounded-xl shadow-lg border border-gray-700">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-whatsapp-green flex items-center justify-center text-2xl">
                                {driver.vehicle_type === 'motorcycle' ? '🏍️' : '🚗'}
                            </div>
                            <div>
                                <p className="text-white font-bold">{driver.username}</p>
                                <p className="text-gray-400 text-sm">
                                    {driver.vehicle_type === 'motorcycle' ? 'Motocicleta' : 'Automóvel'}
                                </p>
                            </div>
                        </div>
                        <a
                            href={`https://www.google.com/maps/search/?api=1&query=${driverLocation.lat},${driverLocation.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-bold hover:bg-blue-700 transition flex items-center gap-1"
                        >
                            <span className="material-icons text-sm">navigation</span>
                            Abrir
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};
