import React, { useEffect, useRef, useState } from 'react';

interface DriverMapModalProps {
    clientLocation: { lat: number; lng: number };
    driverLocation: { lat: number; lng: number };
    onClose: () => void;
}

export const DriverMapModal: React.FC<DriverMapModalProps> = ({ clientLocation, driverLocation, onClose }) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const [distance, setDistance] = useState<string>('');
    const [duration, setDuration] = useState<string>('');
    const [error, setError] = useState<string>('');
    const driverMarkerRef = useRef<any>(null);
    const clientMarkerRef = useRef<any>(null);

    useEffect(() => {
        const initializeMap = () => {
            if (!mapRef.current || !window.google) return;

            try {
                const map = new window.google.maps.Map(mapRef.current, {
                    zoom: 13,
                    center: driverLocation,
                    disableDefaultUI: false,
                    styles: [
                        { "elementType": "geometry", "stylers": [{ "color": "#242f3e" }] },
                        { "elementType": "labels.text.stroke", "stylers": [{ "color": "#242f3e" }] },
                        { "elementType": "labels.text.fill", "stylers": [{ "color": "#746855" }] },
                        { "featureType": "administrative.locality", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] },
                        { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] },
                        { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#263c3f" }] },
                        { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [{ "color": "#6b9a76" }] },
                        { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] },
                        { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#212a37" }] },
                        { "featureType": "road", "elementType": "labels.text.fill", "stylers": [{ "color": "#9ca5b3" }] },
                        { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#746855" }] },
                        { "featureType": "road.highway", "elementType": "geometry.stroke", "stylers": [{ "color": "#1f2835" }] },
                        { "featureType": "road.highway", "elementType": "labels.text.fill", "stylers": [{ "color": "#f3d19c" }] },
                        { "featureType": "transit", "elementType": "geometry", "stylers": [{ "color": "#2f3948" }] },
                        { "featureType": "transit.station", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] },
                        { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#17263c" }] },
                        { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#515c6d" }] },
                        { "featureType": "water", "elementType": "labels.text.stroke", "stylers": [{ "color": "#17263c" }] }
                    ]
                });

                const directionsService = new window.google.maps.DirectionsService();
                const directionsRenderer = new window.google.maps.DirectionsRenderer({
                    map: map,
                    suppressMarkers: true,
                    polylineOptions: {
                        strokeColor: "#00a884",
                        strokeWeight: 6
                    }
                });

                // Custom Markers
                driverMarkerRef.current = new window.google.maps.Marker({
                    position: driverLocation,
                    map: map,
                    icon: {
                        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="16" fill="#111B21" stroke="#2563EB" stroke-width="4"/><circle cx="20" cy="20" r="5" fill="white"/></svg>'),
                        scaledSize: new window.google.maps.Size(32, 32),
                        anchor: new window.google.maps.Point(16, 16)
                    }
                });

                clientMarkerRef.current = new window.google.maps.Marker({
                    position: clientLocation,
                    map: map,
                    icon: {
                        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="16" fill="#111B21" stroke="#25D366" stroke-width="4"/><circle cx="20" cy="20" r="5" fill="white"/></svg>'),
                        scaledSize: new window.google.maps.Size(32, 32),
                        anchor: new window.google.maps.Point(16, 16)
                    }
                });

                const request = {
                    origin: driverLocation,
                    destination: clientLocation,
                    travelMode: window.google.maps.TravelMode.DRIVING
                };

                directionsService.route(request, (result: any, status: any) => {
                    if (status === window.google.maps.DirectionsStatus.OK) {
                        directionsRenderer.setDirections(result);
                        const leg = result.routes[0].legs[0];
                        setDistance(leg.distance.text);
                        setDuration(leg.duration.text);
                    } else {
                        console.error("Directions request failed due to " + status);
                        setError(`Erro ao traçar rota: ${status}`);
                    }
                });
            } catch (e) {
                console.error("Map initialization error", e);
                setError("Erro ao inicializar o mapa.");
            }
        };

        if (window.google && window.google.maps) {
            initializeMap();
        } else {
            const handleMapsLoaded = () => {
                initializeMap();
            };
            window.addEventListener('google-maps-loaded', handleMapsLoaded);
            return () => window.removeEventListener('google-maps-loaded', handleMapsLoaded);
        }

    }, [clientLocation, driverLocation]);

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col animate-fade-in">
            {/* Header */}
            <div className="bg-whatsapp-panel p-4 flex items-center justify-between shadow-md z-10">
                <div className="flex flex-col">
                    <h2 className="text-white font-bold text-lg">Rota até o Cliente</h2>
                    {distance && duration && (
                        <span className="text-whatsapp-green text-sm font-mono">
                            {distance} • {duration}
                        </span>
                    )}
                    {error && (
                        <span className="text-red-500 text-xs">{error}</span>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className="p-2 bg-gray-700 rounded-full text-white hover:bg-gray-600 transition"
                >
                    <span className="material-icons">close</span>
                </button>
            </div>

            {/* Map Container */}
            <div className="flex-1 relative">
                <div ref={mapRef} className="w-full h-full" />

                {/* Floating Action Button to Open in Google Maps App */}
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
