
import React, { useEffect, useRef, useState } from 'react';
import { UserProfile, AppSettings } from '../types';

interface AppMapProps {
    drivers: UserProfile[];
    userLocation?: { lat: number, lng: number };
    onMarkerClick?: (driver: UserProfile) => void;
    settings?: AppSettings | null;
    routeOrigin?: { lat: number, lng: number };
    routeDestination?: { lat: number, lng: number };
    showRoute?: boolean;
    navigationMode?: boolean; // New prop for navigation view
    onRouteInfo?: (info: { distance: string; duration: string }) => void;
}

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
    const markers = useRef<Map<string, any>>(new Map());
    const [heading, setHeading] = useState(0); // For simulation or future gps usage

    const isDarkMode = () => {
        return false; // Sempre usar tema claro
    };

    const lightStyle = [
        // Água em azul claro
        {
            featureType: "water",
            elementType: "geometry",
            stylers: [{ color: "#aadaff" }]
        },
        // Parques em verde claro
        {
            featureType: "poi.park",
            elementType: "geometry",
            stylers: [{ color: "#d4f1c5" }]
        },
        // Estradas um pouco mais destacadas
        {
            featureType: "road",
            elementType: "geometry.fill",
            stylers: [{ color: "#ffffff" }]
        },
        {
            featureType: "road",
            elementType: "geometry.stroke",
            stylers: [{ color: "#d0d0d0" }, { weight: 0.5 }]
        },
        // Rodovias em amarelo suave
        {
            featureType: "road.highway",
            elementType: "geometry.fill",
            stylers: [{ color: "#ffe873" }]
        },
        {
            featureType: "road.highway",
            elementType: "geometry.stroke",
            stylers: [{ color: "#efd151" }]
        },
        // Labels de ruas mais visíveis
        {
            featureType: "road",
            elementType: "labels.text.fill",
            stylers: [{ color: "#2b2b2b" }]
        },
        {
            featureType: "road",
            elementType: "labels.text.stroke",
            stylers: [{ color: "#ffffff" }, { weight: 3 }]
        },
        // Landscape suave
        {
            featureType: "landscape",
            stylers: [{ color: "#f5f5f5" }]
        },
        // POIs sutis
        {
            featureType: "poi",
            elementType: "geometry",
            stylers: [{ color: "#eeeeee" }]
        }
    ];

    const darkStyle = [
        { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
        {
            featureType: "administrative.locality",
            elementType: "labels.text.fill",
            stylers: [{ color: "#d59563" }],
        },
        {
            featureType: "poi",
            elementType: "labels.text.fill",
            stylers: [{ color: "#d59563" }],
        },
        {
            featureType: "poi.park",
            elementType: "geometry",
            stylers: [{ color: "#263c3f" }],
        },
        {
            featureType: "poi.park",
            elementType: "labels.text.fill",
            stylers: [{ color: "#6b9a76" }],
        },
        {
            featureType: "road",
            elementType: "geometry",
            stylers: [{ color: "#38414e" }],
        },
        {
            featureType: "road",
            elementType: "geometry.stroke",
            stylers: [{ color: "#212a37" }],
        },
        {
            featureType: "road",
            elementType: "labels.text.fill",
            stylers: [{ color: "#9ca5b3" }],
        },
        {
            featureType: "road.highway",
            elementType: "geometry",
            stylers: [{ color: "#746855" }],
        },
        {
            featureType: "road.highway",
            elementType: "geometry.stroke",
            stylers: [{ color: "#1f2835" }],
        },
        {
            featureType: "road.highway",
            elementType: "labels.text.fill",
            stylers: [{ color: "#f3d19c" }],
        },
        {
            featureType: "transit",
            elementType: "geometry",
            stylers: [{ color: "#2f3948" }],
        },
        {
            featureType: "transit.station",
            elementType: "labels.text.fill",
            stylers: [{ color: "#d59563" }],
        },
        {
            featureType: "water",
            elementType: "geometry",
            stylers: [{ color: "#17263c" }],
        },
        {
            featureType: "water",
            elementType: "labels.text.fill",
            stylers: [{ color: "#515c6d" }],
        },
        {
            featureType: "water",
            elementType: "labels.text.stroke",
            stylers: [{ color: "#17263c" }],
        },
    ];

    useEffect(() => {
        const initMap = () => {
            if (!window.google || !mapRef.current || mapInstance.current) return;

            const center = userLocation || { lat: -3.7319, lng: -38.5267 };

            mapInstance.current = new window.google.maps.Map(mapRef.current, {
                center,
                zoom: 15,
                styles: lightStyle, // Usar tema claro
                disableDefaultUI: true,
                gestureHandling: 'greedy',
                backgroundColor: '#f5f5f5', // Branco suave
            });

            // Trigger initial resize
            setTimeout(() => {
                if (mapInstance.current && window.google) {
                    window.google.maps.event.trigger(mapInstance.current, "resize");
                }
            }, 500);
        };

        if (window.google) {
            initMap();
        } else {
            // Retry if google script is not loaded yet
            const interval = setInterval(() => {
                if (window.google) {
                    initMap();
                    clearInterval(interval);
                }
            }, 500);
            return () => clearInterval(interval);
        }
    }, []); // Only init once, but with retry mechanism

    useEffect(() => {
        if (!mapInstance.current) return;

        // Update markers
        const currentIds = new Set(drivers.map(d => d.id));

        // Remove old markers
        markers.current.forEach((marker, id) => {
            if (!currentIds.has(id)) {
                marker.setMap(null);
                markers.current.delete(id);
            }
        });

        // Add/Update new markers
        drivers.forEach(driver => {
            if (driver.lat && driver.lng) {
                const pos = { lat: driver.lat, lng: driver.lng };
                let marker = markers.current.get(driver.id);

                if (marker) {
                    marker.setPosition(pos);
                } else {
                    // Ícones Personalizados ou Padrão
                    const carIcon = settings?.car_icon_url ? {
                        url: settings.car_icon_url,
                        scaledSize: new window.google.maps.Size(40, 40)
                    } : {
                        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" height="40" viewBox="0 0 24 24" width="40"><path d="M0 0h24v24H0z" fill="none"/><path fill="#25D366" stroke="#111b21" stroke-width="0.5" d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>'),
                        scaledSize: new window.google.maps.Size(40, 40),
                        anchor: new window.google.maps.Point(20, 20)
                    };

                    const motoIcon = settings?.moto_icon_url ? {
                        url: settings.moto_icon_url,
                        scaledSize: new window.google.maps.Size(40, 40)
                    } : {
                        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" height="40" viewBox="0 0 24 24" width="40"><path d="M0 0h24v24H0z" fill="none"/><path fill="#FFA500" stroke="#111b21" stroke-width="0.5" d="M20 6c0-1.1-.9-2-2-2s-2 .9-2 2 .9 2 2 2 2-.9 2-2zm-5 10c0-2.76-2.24-5-5-5s-5 2.24-5 5 2.24 5 5 5 5-2.24 5-5zm-5 3c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zM1 11h2c0-2.21 1.79-4 4-4s4 1.79 4 4c0 1.25-.56 2.37-1.42 3.14l-1.37-1.45C9.07 12.07 9.4 11.57 9.4 11c0-1.1-.9-2-2-2s-2 .9-2 2c0 .24.06.46.16.66l-1.55 1.63C2.52 12.55 1 11.58 1 11zm17 2.33l-1.74-5.81c.58-.2 1.12-.49 1.61-.86l1.09 3.65c.57 1.91-.49 3.96-2.36 4.63l-.33-1.21c.85-.31 1.33-1.24 1.07-2.09-.27-.88-1.21-1.37-2.09-1.1-1.13.34-2.24 1.05-3.08 2.06l1.37 1.45c.61-.73 1.4-1.25 2.24-1.53l.36 1.21c-1.99.66-4.14-.37-4.87-2.31l-1.63-5.45c.89-1.07 2.21-1.68 3.61-1.68 1.94 0 3.68 1.16 4.45 2.95l1.09 3.65c-.09.11-.18.23-.25.35z"/></svg>'),
                        scaledSize: new window.google.maps.Size(40, 40),
                        anchor: new window.google.maps.Point(20, 20)
                    };

                    const iconUrl = driver.vehicle_type === 'motorcycle' ? motoIcon : carIcon;

                    marker = new window.google.maps.Marker({
                        position: pos,
                        map: mapInstance.current,
                        title: driver.username,
                        icon: iconUrl,
                        zIndex: 10 // Drivers below user
                    });

                    marker.addListener('click', () => onMarkerClick && onMarkerClick(driver));
                    markers.current.set(driver.id, marker);
                }
            }
        });
    }, [drivers]);

    // Handle User Location Marker
    const userMarker = useRef<any>(null);
    const startMarker = useRef<any>(null);
    const endMarker = useRef<any>(null);
    const directionsRenderer = useRef<any>(null);
    const directionsService = useRef<any>(null);
    const lastRouteCoords = useRef<string>('');
    const lastPosKey = useRef<string>('');
    const lastCameraOptions = useRef({ tilt: -1, zoom: -1, heading: -1 });
    const [isFollowing, setIsFollowing] = useState(true);

    // Initial Map Setup with listeners for manual interaction
    useEffect(() => {
        if (!window.google || !mapRef.current || mapInstance.current) return;

        const center = userLocation || { lat: -3.7319, lng: -38.5267 };

        mapInstance.current = new window.google.maps.Map(mapRef.current, {
            center,
            zoom: 17,
            styles: isDarkMode() ? darkStyle : [],
            disableDefaultUI: true,
            gestureHandling: 'greedy',
            backgroundColor: '#0b141a',
        });

        // Detect manual interactions to stop following
        const stopFollowing = () => setIsFollowing(false);
        mapInstance.current.addListener('dragstart', stopFollowing);
        mapInstance.current.addListener('zoom_changed', () => {
            const currentZoom = mapInstance.current.getZoom();
            if (Math.abs(currentZoom - lastCameraOptions.current.zoom) > 0.1) {
                setIsFollowing(false);
            }
        });
    }, []);

    // Stabilized Routing Effect
    useEffect(() => {
        if (!mapInstance.current || !window.google) return;

        if (showRoute && routeOrigin && routeDestination) {
            // Estabilizar chamadas: Só recalcula se mudou mais de ~100 metros (3 casas decimais)
            const currentRouteKey = `${routeOrigin.lat.toFixed(3)},${routeOrigin.lng.toFixed(3)}-${routeDestination.lat.toFixed(3)},${routeDestination.lng.toFixed(3)}`;

            // Render markers independently for better performance
            if (!startMarker.current) {
                startMarker.current = new window.google.maps.Marker({
                    position: routeOrigin,
                    map: mapInstance.current,
                    zIndex: 2000,
                    icon: {
                        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="16" fill="#111B21" stroke="#25D366" stroke-width="4"/><circle cx="20" cy="20" r="5" fill="white"/></svg>'),
                        scaledSize: new window.google.maps.Size(32, 32),
                        anchor: new window.google.maps.Point(16, 16)
                    }
                });
            } else {
                startMarker.current.setPosition(routeOrigin);
                startMarker.current.setMap(mapInstance.current);
            }

            if (!endMarker.current) {
                endMarker.current = new window.google.maps.Marker({
                    position: routeDestination,
                    map: mapInstance.current,
                    zIndex: 2000,
                    icon: {
                        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="32" height="32" rx="8" fill="#111B21" stroke="#FF4444" stroke-width="4"/><path d="M14 10V30M14 12C14 12 17 10 20 10C23 10 26 14 29 14V22C29 22 26 18 23 18C20 18 17 22 14 22" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
                        scaledSize: new window.google.maps.Size(32, 32),
                        anchor: new window.google.maps.Point(16, 16)
                    }
                });
            } else {
                endMarker.current.setPosition(routeDestination);
                endMarker.current.setMap(mapInstance.current);
            }

            if (currentRouteKey === lastRouteCoords.current) return;
            lastRouteCoords.current = currentRouteKey;

            // Evitar loops se for muito perto
            const distApprox = Math.abs(routeOrigin.lat - routeDestination.lat) + Math.abs(routeOrigin.lng - routeDestination.lng);
            if (distApprox < 0.0001) {
                if (onRouteInfo) onRouteInfo({ distance: 'No local', duration: '0 min' });
                if (directionsRenderer.current) directionsRenderer.current.setDirections({ routes: [] });
                return;
            }

            if (!directionsService.current) directionsService.current = new window.google.maps.DirectionsService();
            if (!directionsRenderer.current) {
                directionsRenderer.current = new window.google.maps.DirectionsRenderer({
                    map: mapInstance.current,
                    suppressMarkers: true,
                    polylineOptions: {
                        strokeColor: '#25D366',
                        strokeWeight: 6,
                        strokeOpacity: 0.9
                    }
                });
            }

            directionsService.current.route({
                origin: routeOrigin,
                destination: routeDestination,
                travelMode: window.google.maps.TravelMode.DRIVING
            }, (result: any, status: string) => {
                if (status === 'OK' && directionsRenderer.current) {
                    directionsRenderer.current.setDirections(result);
                    const leg = result.routes[0]?.legs[0];
                    if (leg && onRouteInfo) {
                        onRouteInfo({
                            distance: leg.distance.text,
                            duration: leg.duration.text
                        });
                    }
                }
            });
        } else {
            if (directionsRenderer.current) directionsRenderer.current.setDirections({ routes: [] });
            if (startMarker.current) startMarker.current.setMap(null);
            if (endMarker.current) endMarker.current.setMap(null);
            lastRouteCoords.current = '';
        }
    }, [showRoute, routeOrigin, routeDestination]);

    // Stabilized User Location & Camera Effect
    useEffect(() => {
        if (!mapInstance.current || !userLocation || !window.google) return;

        // Estabilizar ícone (5 casas decimais = ~1 metro)
        const currentPosKey = `${userLocation.lat.toFixed(5)},${userLocation.lng.toFixed(5)},${navigationMode},${heading},${isFollowing}`;
        if (currentPosKey === lastPosKey.current) return;
        lastPosKey.current = currentPosKey;

        if (userMarker.current) {
            userMarker.current.setPosition(userLocation);
            const icon = userMarker.current.getIcon();
            if (icon && typeof icon === 'object') {
                (icon as any).rotation = heading;
                userMarker.current.setIcon(icon);
            }
        } else {
            userMarker.current = new window.google.maps.Marker({
                position: userLocation,
                map: mapInstance.current,
                title: "Sua Localização",
                zIndex: 1000,
                icon: {
                    path: 'M12,2L4.5,20.29L5.21,21L12,18L18.79,21L19.5,20.29L12,2Z',
                    fillColor: "#2563eb",
                    fillOpacity: 1,
                    strokeColor: "#ffffff",
                    strokeWeight: 2,
                    scale: 2.2,
                    anchor: new window.google.maps.Point(12, 12),
                    rotation: heading
                }
            });
        }

        // Auto-follow logic
        if (isFollowing && navigationMode) {
            const targetTilt = 50;
            const targetZoom = 18;

            if (lastCameraOptions.current.tilt !== targetTilt ||
                lastCameraOptions.current.zoom !== targetZoom ||
                Math.abs(lastCameraOptions.current.heading - heading) > 5) {

                mapInstance.current.setOptions({
                    tilt: targetTilt,
                    zoom: targetZoom,
                    heading: heading
                });

                lastCameraOptions.current = { tilt: targetTilt, zoom: targetZoom, heading: heading };
            }

            mapInstance.current.panTo(userLocation);
        } else if (isFollowing && !navigationMode) {
            mapInstance.current.panTo(userLocation);
        }
    }, [userLocation, navigationMode, heading, isFollowing]);

    // Resize Observer
    useEffect(() => {
        if (!mapRef.current || !mapInstance.current || !window.google) return;
        const observer = new ResizeObserver(() => {
            if (mapInstance.current) window.google.maps.event.trigger(mapInstance.current, 'resize');
        });
        observer.observe(mapRef.current);
        return () => observer.disconnect();
    }, []);

    // Initial Resize
    useEffect(() => {
        if (mapInstance.current && window.google) {
            setTimeout(() => window.google.maps.event.trigger(mapInstance.current, 'resize'), 500);
        }
    }, []);

    return (
        <div className="w-full h-full relative">
            <div ref={mapRef} className="w-full h-full" />

            {/* User Feedback Label */}
            <div className={`absolute top-4 left-4 bg-black/60 backdrop-blur-md text-white text-[10px] px-4 py-2 rounded-full uppercase font-black tracking-widest border border-white/10 transition-all z-10 ${navigationMode ? 'bg-blue-600' : ''}`}>
                {navigationMode ? (isFollowing ? 'Navegação Ativa' : 'Pausado') : 'GPS Ativo'}
            </div>

            {/* Re-center Button */}
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

            {/* Navigation Helper for Mobile */}
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
