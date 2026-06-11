import React, { useState, useEffect, useRef } from 'react';
import { AppSettings, UserProfile } from '../types';
import { fetchAppSettings } from '../services/supabaseClient';
import { ensureMapbox, geocodeAddress, reverseGeocode, getRoute, searchAddresses, AddressSuggestion } from '../services/mapboxService';


interface RideCalculatorProps {
    currentUser: UserProfile;
    onClose: () => void;
}

export const RideCalculator: React.FC<RideCalculatorProps> = ({ currentUser, onClose }) => {
    const [origin, setOrigin] = useState('');
    const [destination, setDestination] = useState('');
    const [vehicleType, setVehicleType] = useState<'car' | 'motorcycle'>('car');
    const [settings, setSettings] = useState<AppSettings | null>(null);

    const [result, setResult] = useState<{
        distanceKm: number;
        durationMin: number;
        price: number;
    } | null>(null);

    const [loading, setLoading] = useState(false);

    // Refs para o mapa Mapbox
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<any>(null);
    const mapLoaded = useRef(false);
    const startMarker = useRef<any>(null);
    const endMarker = useRef<any>(null);

    // Coordenadas resolvidas dos endereços (preenchidas por autocomplete ou geocoding)
    const originCoords = useRef<{ lat: number; lng: number } | null>(null);
    const destCoords = useRef<{ lat: number; lng: number } | null>(null);

    // Autocomplete
    const [originSuggestions, setOriginSuggestions] = useState<AddressSuggestion[]>([]);
    const [destSuggestions, setDestSuggestions] = useState<AddressSuggestion[]>([]);

    // Load Settings
    useEffect(() => {
        fetchAppSettings().then(setSettings);
        if (currentUser.role === 'driver' && currentUser.vehicle_type) {
            setVehicleType(currentUser.vehicle_type);
        }
    }, [currentUser]);

    // Inicializa o mapa Mapbox
    useEffect(() => {
        let cancelled = false;
        ensureMapbox().then((mapboxgl) => {
            if (cancelled || !mapRef.current || mapInstance.current) return;
            const map = new mapboxgl.Map({
                container: mapRef.current,
                style: 'mapbox://styles/mapbox/streets-v12',
                center: [-38.5323, -3.8014],
                zoom: 12,
                attributionControl: false,
            });
            mapInstance.current = map;
            map.on('load', () => {
                mapLoaded.current = true;
                setTimeout(() => map.resize(), 200);
            });
        });
        return () => {
            cancelled = true;
            if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; mapLoaded.current = false; }
        };
    }, []);

    // Auto-preenche a partida com a localização atual
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(async (position) => {
                const { latitude, longitude } = position.coords;
                originCoords.current = { lat: latitude, lng: longitude };
                const addr = await reverseGeocode(latitude, longitude);
                if (addr) setOrigin(addr);
                if (mapInstance.current) {
                    mapInstance.current.setCenter([longitude, latitude]);
                    mapInstance.current.setZoom(15);
                }
            }, (err) => console.warn('Error getting location for calculator:', err));
        }
    }, []);

    // Autocomplete dos campos
    const handleOriginChange = async (text: string) => {
        setOrigin(text);
        originCoords.current = null; // invalida coords ao digitar
        setOriginSuggestions(text.length >= 3 ? await searchAddresses(text, originCoords.current || undefined) : []);
    };
    const handleDestChange = async (text: string) => {
        setDestination(text);
        destCoords.current = null;
        setDestSuggestions(text.length >= 3 ? await searchAddresses(text) : []);
    };
    const pickOrigin = (s: AddressSuggestion) => {
        setOrigin(s.description);
        originCoords.current = s.location;
        setOriginSuggestions([]);
    };
    const pickDest = (s: AddressSuggestion) => {
        setDestination(s.description);
        destCoords.current = s.location;
        setDestSuggestions([]);
    };

    const clearRouteFromMap = () => {
        const map = mapInstance.current;
        if (!map) return;
        if (map.getLayer('calc-route')) map.removeLayer('calc-route');
        if (map.getSource('calc-route')) map.removeSource('calc-route');
        if (startMarker.current) { startMarker.current.remove(); startMarker.current = null; }
        if (endMarker.current) { endMarker.current.remove(); endMarker.current = null; }
    };

    const handleCalculate = async () => {
        if (!origin || !destination || !settings) return;

        setLoading(true);
        setResult(null);

        try {
            const mapboxgl = (window as any).mapboxgl;

            // Resolve coordenadas (usa as do autocomplete ou geocodifica o texto)
            let oCoord = originCoords.current;
            let dCoord = destCoords.current;
            if (!oCoord) { const g = await geocodeAddress(origin); oCoord = g?.location || null; }
            if (!dCoord) { const g = await geocodeAddress(destination); dCoord = g?.location || null; }

            if (!oCoord || !dCoord) {
                alert("Não foi possível localizar os endereços. Verifique e tente novamente.");
                setLoading(false);
                return;
            }

            const route = await getRoute(oCoord, dCoord);
            if (route && route.geometry) {
                const map = mapInstance.current;
                if (map && mapLoaded.current) {
                    clearRouteFromMap();
                    map.addSource('calc-route', {
                        type: 'geojson',
                        data: { type: 'Feature', properties: {}, geometry: route.geometry },
                    });
                    map.addLayer({
                        id: 'calc-route',
                        type: 'line',
                        source: 'calc-route',
                        layout: { 'line-join': 'round', 'line-cap': 'round' },
                        paint: { 'line-color': '#25D366', 'line-width': 6 },
                    });

                    const mkStart = document.createElement('div');
                    mkStart.style.cssText = 'width:32px;height:32px;';
                    mkStart.innerHTML = '<svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="16" fill="#111B21" stroke="#25D366" stroke-width="4"/><circle cx="20" cy="20" r="5" fill="white"/></svg>';
                    startMarker.current = new mapboxgl.Marker({ element: mkStart }).setLngLat([oCoord.lng, oCoord.lat]).addTo(map);

                    const mkEnd = document.createElement('div');
                    mkEnd.style.cssText = 'width:32px;height:32px;';
                    mkEnd.innerHTML = '<svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="32" height="32" rx="8" fill="#111B21" stroke="#FF4444" stroke-width="4"/><path d="M14 10V30M14 12C14 12 17 10 20 10C23 10 26 14 29 14V22C29 22 26 18 23 18C20 18 17 22 14 22" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                    endMarker.current = new mapboxgl.Marker({ element: mkEnd }).setLngLat([dCoord.lng, dCoord.lat]).addTo(map);

                    const coords = route.geometry.coordinates;
                    const bounds = coords.reduce(
                        (b: any, c: [number, number]) => b.extend(c),
                        new mapboxgl.LngLatBounds(coords[0], coords[0])
                    );
                    map.fitBounds(bounds, { padding: 50, duration: 600 });
                }

                const distanceKm = route.distanceKm;
                const durationMin = route.durationMins;

                {
                        // Calculate Price based on current time
                        const now = new Date();
                        const currentTime = now.getHours() * 60 + now.getMinutes();

                        const parseTime = (timeStr?: string) => {
                            if (!timeStr) return 0;
                            const [h, m] = timeStr.split(':').map(Number);
                            return h * 60 + m;
                        };

                        const nightStart = parseTime(settings.night_start_time || '19:00');
                        const nightEnd = parseTime(settings.night_end_time || '23:59');
                        const dawnStart = parseTime(settings.dawn_start_time || '00:00');
                        const dawnEnd = parseTime(settings.dawn_end_time || '05:00');

                        let base = settings.car_base_price;
                        let perKm = settings.car_price_km;
                        let perMin = settings.car_price_min;
                        let startDistLimit = settings.car_start_distance_limit || 0;

                        if (vehicleType === 'motorcycle') {
                            base = settings.moto_base_price;
                            perKm = settings.moto_price_km;
                            perMin = settings.moto_price_min;
                            startDistLimit = settings.moto_start_distance_limit || 0;
                        }

                        // Apply Dynamic Pricing
                        const isNight = (nightStart < nightEnd)
                            ? (currentTime >= nightStart && currentTime <= nightEnd)
                            : (currentTime >= nightStart || currentTime <= nightEnd); // Handles bridge over midnight

                        const isDawn = (dawnStart < dawnEnd)
                            ? (currentTime >= dawnStart && currentTime <= dawnEnd)
                            : (currentTime >= dawnStart || currentTime <= dawnEnd);

                        if (isDawn) {
                            if (vehicleType === 'car') {
                                base = settings.dawn_car_base_price ?? base;
                                perKm = settings.dawn_car_price_km ?? perKm;
                                perMin = settings.dawn_car_price_min ?? perMin;
                            } else {
                                base = settings.dawn_moto_base_price ?? base;
                                perKm = settings.dawn_moto_price_km ?? perKm;
                                perMin = settings.dawn_moto_price_min ?? perMin;
                            }
                        } else if (isNight) {
                            if (vehicleType === 'car') {
                                base = settings.night_car_base_price ?? base;
                                perKm = settings.night_car_price_km ?? perKm;
                                perMin = settings.night_car_price_min ?? perMin;
                            } else {
                                base = settings.night_moto_base_price ?? base;
                                perKm = settings.night_moto_price_km ?? perKm;
                                perMin = settings.night_moto_price_min ?? perMin;
                            }
                        }

                        const chargeableDistance = Math.max(0, distanceKm - startDistLimit);
                        const finalPrice = distanceKm > startDistLimit
                            ? base + (chargeableDistance * perKm) + (durationMin * perMin)
                            : base;

                        setResult({
                            distanceKm,
                            durationMin,
                            price: finalPrice
                        });
                }
            } else {
                alert("Não foi possível traçar a rota. Verifique os endereços.");
            }
            setLoading(false);

        } catch (error) {
            console.error("Erro ao calcular:", error);
            alert("Erro inesperado ao calcular rota.");
            setLoading(false);
        }
    };

    // Helper to format currency
    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4 animate-fade-in">
            <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                {/* AdMob Banner Removed */}

                {/* Header */}
                <div className="bg-whatsapp-green p-4 flex justify-between items-center text-white shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="material-icons">calculate</span>
                        <span className="font-bold text-lg">Simular Corrida</span>
                    </div>
                    <button onClick={onClose} className="hover:bg-white/20 p-1 rounded-full transition">
                        <span className="material-icons">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto flex-1 flex flex-col">

                    {/* Vehicle Selector */}
                    <div className="flex bg-gray-100 p-1 rounded-lg mb-4 shrink-0">
                        <button
                            onClick={() => setVehicleType('car')}
                            className={`flex-1 py-2 rounded-md text-sm font-bold flex items-center justify-center gap-2 transition ${vehicleType === 'car' ? 'bg-white text-whatsapp-green shadow-sm' : 'text-gray-500'}`}
                        >
                            <span className="material-icons text-sm">directions_car</span> Carro
                        </button>
                        <button
                            onClick={() => setVehicleType('motorcycle')}
                            className={`flex-1 py-2 rounded-md text-sm font-bold flex items-center justify-center gap-2 transition ${vehicleType === 'motorcycle' ? 'bg-white text-whatsapp-green shadow-sm' : 'text-gray-500'}`}
                        >
                            <span className="material-icons text-sm">two_wheeler</span> Moto
                        </button>
                    </div>

                    {/* Inputs */}
                    <div className="space-y-3 mb-4 shrink-0">
                        <div className="relative">
                            <span className="material-icons absolute left-3 top-3 text-green-600 z-10">my_location</span>
                            <input
                                type="text"
                                placeholder="Ponto de Partida (Ex: Centro)"
                                value={origin}
                                onChange={e => handleOriginChange(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-whatsapp-green focus:ring-1 focus:ring-whatsapp-green transition"
                            />
                            {originSuggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl z-30 max-h-52 overflow-y-auto border border-gray-200">
                                    {originSuggestions.map((s) => (
                                        <button key={s.placeId} onClick={() => pickOrigin(s)}
                                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-gray-700 text-sm flex items-center gap-2 border-b border-gray-100">
                                            <span className="material-icons text-gray-400 text-base">place</span>
                                            {s.description}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="relative">
                            <span className="material-icons absolute left-3 top-3 text-red-500 z-10">location_on</span>
                            <input
                                type="text"
                                placeholder="Destino (Ex: Shopping)"
                                value={destination}
                                onChange={e => handleDestChange(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-whatsapp-green focus:ring-1 focus:ring-whatsapp-green transition"
                            />
                            {destSuggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl z-30 max-h-52 overflow-y-auto border border-gray-200">
                                    {destSuggestions.map((s) => (
                                        <button key={s.placeId} onClick={() => pickDest(s)}
                                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-gray-700 text-sm flex items-center gap-2 border-b border-gray-100">
                                            <span className="material-icons text-gray-400 text-base">place</span>
                                            {s.description}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={handleCalculate}
                        disabled={loading || !origin || !destination}
                        className="w-full bg-whatsapp-green hover:bg-emerald-600 text-white font-bold py-3 rounded-xl shadow-md transition active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                        {loading ? (
                            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        ) : (
                            <>
                                <span className="material-icons">search</span> Calcular Valor
                            </>
                        )}
                    </button>

                    {/* Results & Map Container */}
                    <div className="mt-4 flex-1 flex flex-col min-h-[200px]">
                        {result && (
                            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 mb-2 shrink-0 animate-fade-in">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="text-gray-500 text-[10px] uppercase tracking-wider">Valor Estimado</p>
                                        <div className="text-2xl font-bold text-whatsapp-green">
                                            {formatCurrency(result.price)}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-gray-700">{result.distanceKm.toFixed(1)} km</p>
                                        <p className="text-xs text-gray-500">{Math.ceil(result.durationMin)} min</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Interactive Map */}
                        <div
                            ref={mapRef}
                            className="w-full flex-1 rounded-xl overflow-hidden shadow-inner border border-gray-200 bg-gray-100 min-h-[150px]"
                        ></div>
                    </div>
                </div>
            </div>
        </div>
    );
};
