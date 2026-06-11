
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, AppSettings, DriverStatus, Message } from '../types';
import { fetchAppSettings, updateDriverStatus, fetchAdminContact, fetchMessages, subscribeToMessages } from '../services/supabaseClient';
import { AppMap } from './AppMap';
import { ChatWindow } from './ChatWindow';
import { soundService } from '../services/soundService';

interface DriverDashboardProps {
    currentUser: UserProfile;
    onOpenProfile: () => void;
    onOpenPlans: () => void;
    onOpenBingo: () => void;
    onOpenCalculator: () => void;
    onLogout: () => void;
    onUpdateUser: (user: UserProfile) => void;
}

export const DriverDashboard: React.FC<DriverDashboardProps> = ({
    currentUser,
    onOpenProfile,
    onOpenPlans,
    onOpenBingo,
    onOpenCalculator,
    onLogout,
    onUpdateUser
}) => {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [showMenu, setShowMenu] = useState(false);
    const [showChat, setShowChat] = useState(false);
    const [chatContact, setChatContact] = useState<UserProfile | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);

    // Taximeter States
    const [taximeterActive, setTaximeterActive] = useState(false);
    const [taximeterRunning, setTaximeterRunning] = useState(false);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [distance, setDistance] = useState(0);
    const [fare, setFare] = useState(0);
    const [lastPos, setLastPos] = useState<{ lat: number, lng: number } | null>(null);

    // GPS
    const [driverLocation, setDriverLocation] = useState<{ lat: number, lng: number } | null>(null);

    const watchIdRef = useRef<number | null>(null);
    const timerRef = useRef<any>(null);
    const gpsRef = useRef<number | null>(null);

    // Day earnings — synced from profile (updated by App.tsx via subscribeToProfiles)
    const [dayEarnings, setDayEarnings] = useState(currentUser.financial_balance || 0);

    useEffect(() => {
        setDayEarnings(currentUser.financial_balance || 0);
    }, [currentUser.financial_balance]);

    useEffect(() => {
        fetchAppSettings().then(setSettings);
        loadAdminContact();
        startGpsWatcher();

        return () => {
            if (gpsRef.current) navigator.geolocation.clearWatch(gpsRef.current);
        };
    }, []);

    const startGpsWatcher = () => {
        if ('geolocation' in navigator) {
            gpsRef.current = navigator.geolocation.watchPosition(
                (pos) => {
                    setDriverLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                },
                (err) => console.warn('GPS Error', err),
                { enableHighAccuracy: true, maximumAge: 5000 }
            );
        }
    };

    const loadAdminContact = async () => {
        const admin = await fetchAdminContact();
        if (admin) {
            setChatContact(admin);
            const msgs = await fetchMessages(currentUser.id, admin.id);
            setMessages(msgs);
        }
    };

    // Timer for Taximeter
    useEffect(() => {
        if (taximeterRunning) {
            timerRef.current = setInterval(() => {
                setElapsedTime(prev => prev + 1);
            }, 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [taximeterRunning]);

    // GPS for Taximeter distance
    useEffect(() => {
        if (taximeterRunning && 'geolocation' in navigator) {
            watchIdRef.current = navigator.geolocation.watchPosition(
                (position) => {
                    const { latitude, longitude, speed } = position.coords;
                    if (lastPos) {
                        const dist = calculateDistance(lastPos.lat, lastPos.lng, latitude, longitude);
                        if ((speed && speed > 1) || dist > 0.010) {
                            setDistance(prev => prev + dist);
                        }
                    }
                    setLastPos({ lat: latitude, lng: longitude });
                },
                (err) => console.warn("GPS Error", err),
                { enableHighAccuracy: true, maximumAge: 0 }
            );
        } else {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
            setLastPos(null);
        }
        return () => {
            if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
        };
    }, [taximeterRunning, lastPos]);

    // Fare Calculation
    useEffect(() => {
        if (!settings) return;

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

        if (currentUser.vehicle_type === 'motorcycle') {
            base = settings.moto_base_price;
            perKm = settings.moto_price_km;
            perMin = settings.moto_price_min;
            startDistLimit = settings.moto_start_distance_limit || 0;
        }

        const isNight = (nightStart < nightEnd)
            ? (currentTime >= nightStart && currentTime <= nightEnd)
            : (currentTime >= nightStart || currentTime <= nightEnd);

        const isDawn = (dawnStart < dawnEnd)
            ? (currentTime >= dawnStart && currentTime <= dawnEnd)
            : (currentTime >= dawnStart || currentTime <= dawnEnd);

        if (isDawn) {
            if (currentUser.vehicle_type !== 'motorcycle') {
                base = settings.dawn_car_base_price ?? base;
                perKm = settings.dawn_car_price_km ?? perKm;
                perMin = settings.dawn_car_price_min ?? perMin;
            } else {
                base = settings.dawn_moto_base_price ?? base;
                perKm = settings.dawn_moto_price_km ?? perKm;
                perMin = settings.dawn_moto_price_min ?? perMin;
            }
        } else if (isNight) {
            if (currentUser.vehicle_type !== 'motorcycle') {
                base = settings.night_car_base_price ?? base;
                perKm = settings.night_car_price_km ?? perKm;
                perMin = settings.night_car_price_min ?? perMin;
            } else {
                base = settings.night_moto_base_price ?? base;
                perKm = settings.night_moto_price_km ?? perKm;
                perMin = settings.night_moto_price_min ?? perMin;
            }
        }

        const timeInMin = elapsedTime / 60;
        const chargeableDistance = Math.max(0, distance - startDistLimit);
        const total = base + (chargeableDistance * perKm) + (timeInMin * perMin);

        setFare(Math.max(base, total));
    }, [elapsedTime, distance, settings, currentUser.vehicle_type]);

    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    const formatTime = (sec: number) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        return `${h > 0 ? h + ':' : ''}${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const handleStatusToggle = async () => {
        if (!currentUser.is_approved) return;
        const newStatus = currentUser.status === DriverStatus.AVAILABLE
            ? DriverStatus.BUSY
            : DriverStatus.AVAILABLE;

        const success = await updateDriverStatus(currentUser.id, newStatus);
        if (success) {
            const updated = { ...currentUser, status: newStatus };
            onUpdateUser(updated);
        }
    };

    const handlePanicButton = () => {
        // Trigger panic alert
        soundService.playReceived();
        alert('🚨 ALERTA DE PÂNICO ATIVADO!\n\nEm uma implementação real, isso enviaria:\n• Sua localização GPS atual\n• Alerta para a central\n• Notificação para contatos de emergência');

        // In production: Send location to backend/emergency contacts
        console.log('PANIC BUTTON PRESSED', {
            driver: currentUser.id,
            location: driverLocation,
            timestamp: new Date().toISOString()
        });
    };

    const handleStartTaximeter = () => {
        setTaximeterActive(true);
        setTaximeterRunning(true);
        setElapsedTime(0);
        setDistance(0);
        if (settings) {
            setFare(currentUser.vehicle_type === 'motorcycle' ? settings.moto_base_price : settings.car_base_price);
        }
    };

    const handleStopTaximeter = () => {
        setTaximeterRunning(false);
    };

    const handleFinishRide = () => {
        setTaximeterActive(false);
        setTaximeterRunning(false);
        // Add to day earnings
        setDayEarnings(prev => prev + fare);
        setElapsedTime(0);
        setDistance(0);
        setFare(0);
    };

    const isOnline = currentUser.status === DriverStatus.AVAILABLE;

    return (
        <div className="flex-1 w-full h-full flex flex-col bg-[#0a0f14] relative overflow-hidden">
            {/* Chat Overlay */}
            {showChat && chatContact && (
                <div className="absolute inset-0 z-[100] bg-whatsapp-dark">
                    <div className="h-full flex flex-col">
                        <div className="h-14 px-4 flex items-center gap-3 bg-whatsapp-panel border-b border-white/10 shrink-0">
                            <button onClick={() => setShowChat(false)} className="text-gray-400 hover:text-white">
                                <span className="material-icons">arrow_back</span>
                            </button>
                            <img src={chatContact.avatar_url || 'https://via.placeholder.com/40'} className="w-10 h-10 rounded-full" />
                            <div>
                                <p className="text-white font-bold">{chatContact.username}</p>
                                <p className="text-xs text-gray-400">Suporte</p>
                            </div>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <ChatWindow
                                currentUser={currentUser}
                                chatPartner={chatContact}
                                messages={messages}
                                onSendMessage={(msg) => setMessages(p => [...p, msg])}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Header - Earnings Display */}
            <div className="shrink-0 bg-gradient-to-r from-[#1a2530] to-[#0f1a24] px-4 py-3 flex items-center justify-between border-b border-white/5 z-20">
                <div className="flex items-center gap-3">
                    <div className="relative" onClick={() => onOpenProfile()}>
                        <img
                            src={currentUser.avatar_url || 'https://via.placeholder.com/40'}
                            className="w-11 h-11 rounded-full border-2 border-green-500/50 object-cover cursor-pointer"
                        />
                        <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-[#1a2530] ${isOnline ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                    </div>
                    <div>
                        <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">Ganhos do Dia</p>
                        <p className="text-2xl font-black text-green-500">R$ {dayEarnings.toFixed(2)}</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowMenu(!showMenu)}
                    className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition"
                >
                    <span className="material-icons">menu</span>
                </button>
            </div>

            {/* Menu Dropdown */}
            {showMenu && (
                <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)}></div>
                    <div className="absolute top-16 right-4 z-40 bg-[#1f2c33] rounded-2xl shadow-2xl border border-white/10 p-2 w-56 animate-fade-in">
                        <button
                            onClick={() => { setShowChat(true); setShowMenu(false); }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 rounded-xl transition text-white text-sm"
                        >
                            <span className="material-icons text-green-400">chat</span>
                            Chat / Suporte
                        </button>
                        <button
                            onClick={() => { onOpenProfile(); setShowMenu(false); }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 rounded-xl transition text-white text-sm"
                        >
                            <span className="material-icons text-teal-400">account_balance_wallet</span>
                            Meus Dados / PIX
                        </button>
                        <button
                            onClick={() => { onOpenCalculator(); setShowMenu(false); }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 rounded-xl transition text-white text-sm"
                        >
                            <span className="material-icons text-blue-400">calculate</span>
                            Simular Corrida
                        </button>
                        <button
                            onClick={() => { onOpenBingo(); setShowMenu(false); }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 rounded-xl transition text-white text-sm"
                        >
                            <span className="material-icons text-purple-400">casino</span>
                            Bingo
                        </button>
                        <button
                            onClick={() => { onOpenPlans(); setShowMenu(false); }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 rounded-xl transition text-white text-sm"
                        >
                            <span className="material-icons text-yellow-400">monetization_on</span>
                            Meus Planos
                        </button>
                        <button
                            onClick={() => { soundService.requestPermission(); setShowMenu(false); }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 rounded-xl transition text-white text-sm"
                        >
                            <span className="material-icons text-blue-400">notifications_active</span>
                            Ativar Sons
                        </button>
                        <div className="h-px bg-white/10 my-2"></div>
                        <button
                            onClick={onLogout}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-500/10 rounded-xl transition text-red-400 text-sm"
                        >
                            <span className="material-icons">logout</span>
                            Sair
                        </button>
                    </div>
                </>
            )}

            {/* Map */}
            <div className="flex-1 relative">
                <AppMap
                    drivers={[]}
                    userLocation={driverLocation || undefined}
                />

                {/* Floating Status Toggle */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                    <button
                        onClick={handleStatusToggle}
                        disabled={!currentUser.is_approved}
                        className={`px-6 py-2.5 rounded-full text-sm font-bold shadow-xl transition-all flex items-center gap-2 ${!currentUser.is_approved
                                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                : isOnline
                                    ? 'bg-green-500 text-white hover:bg-green-400'
                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                    >
                        <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-white animate-pulse' : 'bg-gray-500'}`}></span>
                        {isOnline ? 'Você está Online' : 'Você está Offline'}
                    </button>
                </div>

                {/* Panic Button - Always visible */}
                <button
                    onClick={handlePanicButton}
                    className="absolute top-4 right-4 z-10 w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-xl flex items-center justify-center active:scale-95 transition animate-pulse"
                    title="Botão do Pânico"
                >
                    <span className="material-icons text-2xl">warning</span>
                </button>
            </div>

            {/* Taximeter Section */}
            {taximeterActive ? (
                <div className="shrink-0 bg-gradient-to-t from-black via-[#0a1520] to-transparent p-4 pb-6 z-10">
                    {/* Taximeter Display */}
                    <div className="bg-[#0d1620] rounded-2xl border border-white/10 overflow-hidden mb-4">
                        <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 p-1 flex justify-center">
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold flex items-center gap-1">
                                <span className="material-icons text-xs text-yellow-500">local_taxi</span>
                                Taxímetro Ativo
                            </span>
                        </div>

                        <div className="p-6 text-center">
                            <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">Valor da Corrida</p>
                            <p className="text-5xl font-black text-green-500 font-mono drop-shadow-[0_0_15px_rgba(34,197,94,0.3)]">
                                R$ {fare.toFixed(2)}
                            </p>

                            <div className="flex justify-center gap-8 mt-4">
                                <div>
                                    <p className="text-gray-500 text-[10px] uppercase">Distância</p>
                                    <p className="text-xl text-blue-400 font-mono">{distance.toFixed(2)} km</p>
                                </div>
                                <div>
                                    <p className="text-gray-500 text-[10px] uppercase">Tempo</p>
                                    <p className="text-xl text-yellow-400 font-mono">{formatTime(elapsedTime)}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Taximeter Controls */}
                    <div className="flex gap-3">
                        {taximeterRunning ? (
                            <button
                                onClick={handleStopTaximeter}
                                className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg active:scale-95 transition"
                            >
                                <span className="material-icons">pause</span>
                                PAUSAR
                            </button>
                        ) : (
                            <button
                                onClick={() => setTaximeterRunning(true)}
                                className="flex-1 bg-green-500 hover:bg-green-400 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg active:scale-95 transition"
                            >
                                <span className="material-icons">play_arrow</span>
                                CONTINUAR
                            </button>
                        )}
                        <button
                            onClick={handleFinishRide}
                            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg active:scale-95 transition"
                        >
                            <span className="material-icons">check_circle</span>
                            FINALIZAR
                        </button>
                    </div>
                </div>
            ) : (
                /* Bottom Action Bar */
                <div className="shrink-0 bg-gradient-to-t from-black via-[#0a1520]/90 to-transparent p-4 pb-6 z-10">
                    <div className="flex gap-3">
                        {/* Main Start Button */}
                        <button
                            onClick={handleStartTaximeter}
                            disabled={!isOnline}
                            className={`flex-1 py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl transition-all active:scale-95 ${isOnline
                                    ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400'
                                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                }`}
                        >
                            <span className="material-icons text-2xl">play_circle</span>
                            INICIAR CORRIDA
                        </button>
                    </div>

                    {/* Quick Actions */}
                    <div className="grid grid-cols-4 gap-2 mt-3">
                        <button
                            onClick={() => setShowChat(true)}
                            className="bg-white/5 hover:bg-white/10 rounded-xl py-3 flex flex-col items-center gap-1 transition"
                        >
                            <span className="material-icons text-green-400">chat</span>
                            <span className="text-[10px] text-gray-400">Chat</span>
                        </button>
                        <button
                            onClick={onOpenProfile}
                            className="bg-white/5 hover:bg-white/10 rounded-xl py-3 flex flex-col items-center gap-1 transition"
                        >
                            <span className="material-icons text-teal-400">account_circle</span>
                            <span className="text-[10px] text-gray-400">Perfil</span>
                        </button>
                        <button
                            onClick={onOpenCalculator}
                            className="bg-white/5 hover:bg-white/10 rounded-xl py-3 flex flex-col items-center gap-1 transition"
                        >
                            <span className="material-icons text-blue-400">calculate</span>
                            <span className="text-[10px] text-gray-400">Simular</span>
                        </button>
                        <button
                            onClick={onOpenPlans}
                            className="bg-white/5 hover:bg-white/10 rounded-xl py-3 flex flex-col items-center gap-1 transition relative"
                        >
                            <span className="material-icons text-yellow-400">workspace_premium</span>
                            <span className="text-[10px] text-gray-400">Planos</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
