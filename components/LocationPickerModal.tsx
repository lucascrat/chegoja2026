import React, { useEffect, useRef, useState } from 'react';
import { ensureMapbox, searchAddresses, reverseGeocode, AddressSuggestion } from '../services/mapboxService';

interface LocationPickerModalProps {
    onLocationSelect: (location: { lat: number; lng: number; address?: string }) => void;
    onClose: () => void;
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({ onLocationSelect, onClose }) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<any>(null);
    const markerRef = useRef<any>(null);
    const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number; address?: string } | null>(null);
    const [error, setError] = useState<string>('');
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);

    useEffect(() => {
        let cancelled = false;
        ensureMapbox().then((mapboxgl) => {
            if (cancelled || !mapRef.current || mapInstance.current) return;
            try {
                const initialPos = { lat: -3.875, lng: -38.625 };
                const map = new mapboxgl.Map({
                    container: mapRef.current,
                    style: 'mapbox://styles/mapbox/dark-v11',
                    center: [initialPos.lng, initialPos.lat],
                    zoom: 13,
                    attributionControl: false,
                });
                mapInstance.current = map;

                map.on('load', () => setTimeout(() => map.resize(), 200));

                // Localização atual
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition((position) => {
                        const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
                        map.setCenter([pos.lng, pos.lat]);
                        map.setZoom(15);
                        updateMarker(pos);
                    }, (err) => console.warn('Geolocation failed', err));
                }

                // Clique no mapa coloca o marcador
                map.on('click', (e: any) => {
                    updateMarker({ lat: e.lngLat.lat, lng: e.lngLat.lng });
                });
            } catch (e) {
                console.error('Map initialization error', e);
                setError('Erro ao carregar o mapa. Verifique sua conexão.');
            }
        });
        return () => {
            cancelled = true;
            if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
        };
    }, []);

    const updateMarker = async (location: { lat: number; lng: number }, address?: string) => {
        const mapboxgl = (window as any).mapboxgl;
        const map = mapInstance.current;
        if (!map) return;

        if (markerRef.current) {
            markerRef.current.setLngLat([location.lng, location.lat]);
        } else {
            markerRef.current = new mapboxgl.Marker({ color: '#25D366' })
                .setLngLat([location.lng, location.lat]).addTo(map);
        }

        // Resolve endereço se não veio pronto
        let finalAddress = address;
        if (!finalAddress) {
            finalAddress = (await reverseGeocode(location.lat, location.lng)) || undefined;
        }
        setSelectedLocation({ ...location, address: finalAddress });
    };

    const handleSearch = async (text: string) => {
        setQuery(text);
        if (text.length < 3) { setSuggestions([]); return; }
        const results = await searchAddresses(text);
        setSuggestions(results);
    };

    const handlePick = (s: AddressSuggestion) => {
        setQuery(s.description);
        setSuggestions([]);
        const map = mapInstance.current;
        if (map) {
            map.setCenter([s.location.lng, s.location.lat]);
            map.setZoom(17);
        }
        updateMarker(s.location, s.description);
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col animate-fade-in">
            <div className="bg-whatsapp-panel p-4 flex items-center gap-2 shadow-md z-10 relative">
                <button onClick={onClose} className="p-2 text-gray-400 hover:text-white">
                    <span className="material-icons">arrow_back</span>
                </button>
                <div className="flex-1 bg-[#2a3942] rounded-lg flex items-center px-4 py-2 relative">
                    <span className="material-icons text-gray-400 mr-2">search</span>
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder="Buscar local..."
                        className="bg-transparent border-none outline-none text-white w-full placeholder-gray-400"
                    />
                </div>
                {suggestions.length > 0 && (
                    <div className="absolute top-full left-16 right-4 bg-[#1f2c33] rounded-b-lg shadow-2xl z-20 max-h-64 overflow-y-auto border border-white/10">
                        {suggestions.map((s) => (
                            <button
                                key={s.placeId}
                                onClick={() => handlePick(s)}
                                className="w-full text-left px-4 py-3 hover:bg-white/5 text-white text-sm flex items-center gap-3 border-b border-white/5"
                            >
                                <span className="material-icons text-gray-400 text-base">place</span>
                                {s.description}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex-1 relative">
                <div ref={mapRef} className="w-full h-full" />
                {error && (
                    <div className="absolute top-4 left-4 right-4 bg-red-500/90 text-white p-3 rounded-lg z-20 text-center">
                        {error}
                    </div>
                )}

                {selectedLocation && (
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-whatsapp-panel border-t border-gray-700 flex items-center justify-between animate-slide-up-mobile">
                        <div className="flex flex-col">
                            <span className="text-white font-medium">Local selecionado</span>
                            <span className="text-gray-400 text-sm">
                                {selectedLocation.address || `${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)}`}
                            </span>
                        </div>
                        <button
                            onClick={() => onLocationSelect(selectedLocation)}
                            className="bg-whatsapp-green text-white px-6 py-3 rounded-full font-bold shadow-lg hover:bg-emerald-600 transition"
                        >
                            Enviar
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
