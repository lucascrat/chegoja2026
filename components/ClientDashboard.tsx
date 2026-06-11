
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, UserRole, Ride, DriverStatus, AppSettings, Coupon } from '../types';
import { fetchOnlineDrivers, createRideRequest, fetchActiveRide, subscribeToRides, fetchAppSettings, cancelRide, subscribeToProfiles, fetchAvailableCoupons, useCoupon, updateUserProfile, supabase } from '../services/supabaseClient';
import { AdBanner } from './AdBanner';
import { DriverStories } from './DriverStories';
import { AppMap } from './AppMap';
import { RideStatusOverlay } from './RideStatusOverlay';
import { sendNotification } from '../services/notificationSender';
import { RewardsHub } from './RewardsHub';
import { searchAddresses, reverseGeocode, getDistance } from '../services/mapboxService';
import { DEFAULT_RIDE_RADIUS_KM, getDistanceKm } from '../constants';

interface ClientDashboardProps {
    currentUser: UserProfile;
    onStartChat: (driver: UserProfile) => void;
    onOpenBingo: () => void;
    onOpenWallet?: () => void;
    activeRide: Ride | null;
    setActiveRide: (ride: Ride | null) => void;
    onUpdateUser?: (user: UserProfile) => void;
    onLogout: () => void;
}

export const ClientDashboard: React.FC<ClientDashboardProps> = ({
    currentUser,
    onStartChat,
    onOpenBingo,
    onOpenWallet,
    activeRide,
    setActiveRide,
    onUpdateUser,
    onLogout
}) => {
    const [drivers, setDrivers] = useState<UserProfile[]>([]);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
    const [selectedVehicleType, setSelectedVehicleType] = useState<'car' | 'motorcycle'>('car');
    const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | undefined>();
    const [activeTab, setActiveTab] = useState<'home' | 'drivers' | 'rewards' | 'wallet'>('home');
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // Motoristas dentro do raio de atendimento (multi-cidades: não exibe motoristas de outra cidade)
    const rideRadiusKm = settings?.ride_radius_km || DEFAULT_RIDE_RADIUS_KM;
    const nearbyDrivers = userLocation
        ? drivers.filter(d =>
            d.lat != null && d.lng != null &&
            getDistanceKm(userLocation.lat, userLocation.lng, d.lat, d.lng) <= rideRadiusKm)
        : drivers;

    // Ref para o polling de corrida (evita stale closure no setInterval)
    const activeRideRef = useRef<Ride | null>(activeRide);
    useEffect(() => { activeRideRef.current = activeRide; }, [activeRide]);

    // Timeout de busca: se ninguém aceitar em 90s, avisa o cliente.
    // Em 10 min sem aceite, cancela automaticamente (devolve o cupom) — assim a
    // corrida não fica "tocando" para motoristas indefinidamente.
    const [searchTimedOut, setSearchTimedOut] = useState(false);
    useEffect(() => {
        if (activeRide?.status === 'searching') {
            setSearchTimedOut(false);
            const t = setTimeout(() => setSearchTimedOut(true), 90000);
            const expire = setTimeout(async () => {
                await cancelRide(activeRide.id);
                setActiveRide(null);
                notify("Nenhum motorista aceitou sua corrida. Tente novamente.");
            }, 600000);
            return () => { clearTimeout(t); clearTimeout(expire); };
        } else {
            setSearchTimedOut(false);
        }
    }, [activeRide?.status, activeRide?.id]);

    // View State Management
    type ViewState = 'home' | 'search_input' | 'location_check' | 'vehicle_select';
    const [viewState, setViewState] = useState<ViewState>('home');
    const [targetDriverId, setTargetDriverId] = useState<string | null>(null);

    // Handle initial search click
    const startSearch = async () => {
        setViewState('search_input');

        // Load recent addresses from history
        const { data: historyData } = await supabase.rpc('search_address_history', { p_query: '' });
        if (historyData && historyData.length > 0) {
            const formattedHistory = historyData.slice(0, 5).map((item: any) => ({
                description: item.address,
                place_id: `history_${item.lat}_${item.lng}`,
                isHistory: true,
                location: { lat: item.lat, lng: item.lng },
                usageCount: item.p_count
            }));
            setRecentAddresses(formattedHistory);
        }

        // Update current location
        if (navigator.geolocation && (!currentAddress || currentAddress === 'Obtendo localização...')) {
            navigator.geolocation.getCurrentPosition(async (pos) => {
                setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                if (!isManualOrigin.current) {
                    const addr = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
                    if (addr) setCurrentAddress(addr);
                }
            });
        }
    };

    const confirmLocation = () => {
        setViewState('vehicle_select');
        if (destination) {
            updateEstimates({ lat: destination.lat, lng: destination.lng });
        }
    };

    // State for Custom Autocomplete
    const [destinationText, setDestinationText] = useState('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [activeField, setActiveField] = useState<'origin' | 'destination' | null>(null);
    const [currentAddress, setCurrentAddress] = useState<string>('Obtendo localização...');
    const [destination, setDestination] = useState<{ lat: number, lng: number, address: string } | null>(null);
    const [recentAddresses, setRecentAddresses] = useState<any[]>([]); // Histórico de endereços
    const isManualOrigin = useRef(false);
    const [estimates, setEstimates] = useState<{ car: number, motorcycle: number, distance: number, time: number } | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'pix' | 'card' | 'coins'>('cash');

    // ... calculatePrices logic restored ...
    const calculatePrices = (distanceKm: number, timeMin: number) => {
        if (!settings) return null;
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

        let carBase = settings.car_base_price;
        let carPerKm = settings.car_price_km;
        let carPerMin = settings.car_price_min;
        let carStartDistLimit = settings.car_start_distance_limit || 0;

        let motoBase = settings.moto_base_price;
        let motoPerKm = settings.moto_price_km;
        let motoPerMin = settings.moto_price_min;
        let motoStartDistLimit = settings.moto_start_distance_limit || 0;

        const isNight = (nightStart < nightEnd)
            ? (currentTime >= nightStart && currentTime <= nightEnd)
            : (currentTime >= nightStart || currentTime <= nightEnd);

        const isDawn = (dawnStart < dawnEnd)
            ? (currentTime >= dawnStart && currentTime <= dawnEnd)
            : (currentTime >= dawnStart || currentTime <= dawnEnd);

        if (isDawn) {
            carBase = settings.dawn_car_base_price ?? carBase;
            carPerKm = settings.dawn_car_price_km ?? carPerKm;
            carPerMin = settings.dawn_car_price_min ?? carPerMin;
            motoBase = settings.dawn_moto_base_price ?? motoBase;
            motoPerKm = settings.dawn_moto_price_km ?? motoPerKm;
            motoPerMin = settings.dawn_moto_price_min ?? motoPerMin;
        } else if (isNight) {
            carBase = settings.night_car_base_price ?? carBase;
            carPerKm = settings.night_car_price_km ?? carPerKm;
            carPerMin = settings.night_car_price_min ?? carPerMin;
            motoBase = settings.night_moto_base_price ?? motoBase;
            motoPerKm = settings.night_moto_price_km ?? motoPerKm;
            motoPerMin = settings.night_moto_price_min ?? motoPerMin;
        }

        const carExtraKm = Math.max(0, distanceKm - carStartDistLimit);
        const carPrice = distanceKm > carStartDistLimit
            ? carBase + (carExtraKm * carPerKm) + (timeMin * carPerMin)
            : carBase;

        const motoExtraKm = Math.max(0, distanceKm - motoStartDistLimit);
        const motoPrice = distanceKm > motoStartDistLimit
            ? motoBase + (motoExtraKm * motoPerKm) + (timeMin * motoPerMin)
            : motoBase;

        return {
            car: carPrice,
            motorcycle: motoPrice,
            distance: distanceKm,
            time: timeMin
        };
    };

    const updateEstimates = async (dest: { lat: number, lng: number }) => {
        if (!userLocation) return;
        const result = await getDistance(userLocation, dest);
        if (result) {
            const calculated = calculatePrices(result.distanceKm, result.durationMins);
            setEstimates(calculated);
        }
    };

    useEffect(() => {
        if (destination) {
            updateEstimates({ lat: destination.lat, lng: destination.lng });
        } else {
            setEstimates(null);
        }
    }, [destination, userLocation]);

    useEffect(() => {
        const loadInitialData = async () => {
            const [onlineDrivers, appSettings, availableCoupons] = await Promise.all([
                fetchOnlineDrivers(),
                fetchAppSettings(),
                fetchAvailableCoupons()
            ]);
            setDrivers(onlineDrivers);
            setSettings(appSettings);
            setCoupons(availableCoupons);
        };
        loadInitialData();

        // Subscriptions para Realtime
        const settingsSub = supabase
            .channel('app_settings_changes')
            .on('postgres_changes', { event: '*', schema: 'chegoja', table: 'app_settings' }, (payload) => {
                console.log('[Realtime] App Settings atualizado:', payload.new);
                setSettings(payload.new as AppSettings);
            })
            .subscribe();

        const couponsSub = supabase
            .channel('coupons_changes')
            .on('postgres_changes', { event: '*', schema: 'chegoja', table: 'coupons' }, () => {
                fetchAvailableCoupons().then(setCoupons);
            })
            .subscribe();

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(async (pos) => {
                setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                // Reverse geocode da localização atual se não for manual
                if (!isManualOrigin.current) {
                    const addr = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
                    if (addr) setCurrentAddress(addr);
                }
            });
        }
        const profileSub = subscribeToProfiles(() => fetchOnlineDrivers().then(setDrivers));
        const rideSub = subscribeToRides(currentUser.id, 'client', (updatedRide) => setActiveRide(updatedRide));

        // Polling de segurança: sincroniza o status da corrida direto do banco
        // a cada 5s (cobre falhas do realtime — ex: aceite do motorista não chegar)
        const ridePoll = setInterval(async () => {
            const prev = activeRideRef.current;
            if (!prev) return; // sem corrida ativa local, não força nada
            const fresh = await fetchActiveRide(currentUser.id, 'client');
            if (!fresh) {
                // corrida finalizada/cancelada no servidor
                if (activeRideRef.current) setActiveRide(null);
                return;
            }
            if (fresh.id !== prev.id || fresh.status !== prev.status || fresh.driver_id !== prev.driver_id) {
                console.log(`[RidePoll] Status atualizado: ${prev.status} -> ${fresh.status}`);
                setActiveRide(fresh); // já vem com join de driver/client
            }
        }, 5000);

        return () => {
            clearInterval(ridePoll);
            profileSub.unsubscribe();
            rideSub.unsubscribe();
            supabase.removeChannel(settingsSub);
            supabase.removeChannel(couponsSub);
        };
    }, [currentUser.id]);

    // Function to search addresses (Mapbox + Histórico)
    const handleSearch = async (query: string, field: 'origin' | 'destination') => {
        if (field === 'destination') setDestinationText(query);
        else setCurrentAddress(query);

        if (query.length < 3) {
            setSuggestions([]);
            return;
        }

        setActiveField(field);

        // 1. Busca no histórico (Supabase RPC)
        const { data: historyData } = await supabase.rpc('search_address_history', { p_query: query });
        const historySuggestions = (historyData || []).map((item: any) => ({
            description: item.address,
            place_id: `history_${item.lat}_${item.lng}`,
            isHistory: true,
            location: { lat: item.lat, lng: item.lng }
        }));

        // 2. Busca no Mapbox (já retorna coordenadas)
        const mapboxResults = await searchAddresses(query, userLocation || undefined);
        const mapboxSuggestions = mapboxResults.map((r) => ({
            description: r.description,
            place_id: r.placeId,
            isHistory: false,
            location: r.location,
        }));

        // Mescla: histórico primeiro, depois Mapbox
        setSuggestions([...historySuggestions, ...mapboxSuggestions]);
    };

    // Handle Selection
    const handleSelectAddress = (item: any) => {
        const field = activeField; // Capture current field
        setSuggestions([]);
        setActiveField(null);


        const updateLocation = (lat: number, lng: number, address: string) => {
            if (activeField === 'origin' || field === 'origin') {
                isManualOrigin.current = true;
                setUserLocation({ lat, lng });
                setCurrentAddress(address);
                // Also update map center/marker if needed via effect
            } else {
                setDestination({ lat, lng, address });
                setDestinationText(address);
                setViewState('location_check'); // Auto-advance
            }

            // Save to History (Fire and Forget)
            supabase.rpc('register_address_usage', {
                p_address: address,
                p_lat: lat,
                p_lng: lng
            }).then();
        };

        // Tanto histórico quanto Mapbox já trazem as coordenadas prontas
        if (item.location) {
            updateLocation(item.location.lat, item.location.lng, item.description);
        } else {
            notify("Erro ao buscar detalhes do endereço.");
        }
    };

    // ... (Existing Effects for Initial Data and Geo) ...

    // REMOVED OLD AUTOCOMPLETE EFFECT (It was failing on web sometimes)

    const notify = (msg: string) => {
        if (window.Android?.showToast) {
            window.Android.showToast(msg);
        } else {
            alert(msg);
        }
    };

    const handleRequestRide = async (type: 'car' | 'motorcycle') => {
        try {
            if (!userLocation) {
                notify("GPS desligado ou sem sinal. Ative a localização e aguarde um momento.");
                return;
            }

            if (!destination) {
                notify("Atenção: Você precisa selecionar um destino na lista de sugestões.");
                return;
            }

            let originalPrice = type === 'car' ? (estimates?.car || settings?.car_base_price || 0) : (estimates?.motorcycle || settings?.moto_base_price || 0);
            let finalPrice = originalPrice;
            let discountAmount = 0;

            // Aplicar desconto do cupom se válido
            if (selectedCoupon && (selectedCoupon.vehicle_type === 'all' || selectedCoupon.vehicle_type === type)) {
                discountAmount = selectedCoupon.discount_value;
                finalPrice = Math.max(0, originalPrice - discountAmount);
            }

            // Validar pagamento com moedas
            if (paymentMethod === 'coins') {
                const userCoins = currentUser.wallet_coins || 0;
                const coinValue = settings?.coin_value_brl || 1.0; // Valor padrão alinhado ao banco (R$ 1,00/moeda)
                const requiredCoins = Math.ceil(finalPrice / coinValue);

                if (userCoins < requiredCoins) {
                    notify(`Saldo insuficiente! Você precisa de ${requiredCoins} moedas (possui ${userCoins}). Escolha outro método de pagamento.`);
                    return;
                }
            }

            const { data: newRide, error: dbError } = await createRideRequest({
                client_id: currentUser.id,
                driver_id: targetDriverId || undefined,
                vehicle_type: type,
                origin_lat: userLocation.lat,
                origin_lng: userLocation.lng,
                origin_address: currentAddress,
                destination_lat: destination.lat,
                destination_lng: destination.lng,
                destination_address: destination.address,
                estimated_price: finalPrice,
                distance_km: estimates?.distance,
                estimated_time: estimates?.time,
                payment_method: paymentMethod,
                status: 'searching',
                coupon_id: selectedCoupon?.id,
                discount_amount: discountAmount
            });

            if (dbError) {
                console.error("[RideRequest] DB Error:", dbError);
                notify(`Erro ao criar corrida: ${dbError}`);
                return;
            }

            if (newRide) {
                setActiveRide(newRide);

                // Enviar notificação push
                // Se for direcionada, enviamos apenas para o motorista alvo
                sendNotification(
                    targetDriverId ? "Chamada Direta para Você! 🚀" : "Nova Corrida Disponível! 🚗",
                    `Origem: ${currentAddress}\nDestino: ${destination.address}`,
                    targetDriverId ? 'user' : 'nearby_drivers',
                    {
                        targetUserId: targetDriverId || undefined,
                        sound: 'ubb',
                        // Só motoristas num raio de X km da origem recebem o push (multi-cidades)
                        originLat: userLocation.lat,
                        originLng: userLocation.lng,
                        radiusKm: settings?.ride_radius_km || DEFAULT_RIDE_RADIUS_KM,
                        data: {
                            type: 'new_ride',
                            ride_id: newRide.id
                        }
                    }
                ).catch(err => console.error("[Push] Erro ao enviar notificação:", err));

                // Consumir cupom se houver um selecionado
                if (selectedCoupon) {
                    await useCoupon(selectedCoupon.id);
                    setSelectedCoupon(null);
                }
            } else {
                notify(`Erro no servidor: Sem resposta do banco.`);
            }
        } catch (err: any) {
            console.error("[RideRequest] Crash:", err);
            notify("Erro interno ao solicitar. Tente reiniciar o app.");
        }
    };

    const handleCancelRide = async () => {
        if (!activeRide) return;
        const confirmCancel = window.confirm("Deseja cancelar esta corrida?");
        if (confirmCancel) {
            await cancelRide(activeRide.id);
            setActiveRide(null);
            if (window.Android?.showToast) window.Android.showToast("Corrida cancelada.");
        }
    };

    // Helper for Menu Items
    const MenuItem = ({ icon, label, active, onClick }: any) => (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all ${active ? 'bg-whatsapp-green/10 text-whatsapp-green' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
        >
            <span className="material-icons">{icon}</span>
            <span className="font-bold text-sm tracking-wide">{label}</span>
        </button>
    );

    return (
        <div className="flex-1 flex flex-col h-full bg-[#111b21] relative overflow-hidden font-sans">

            {/* Top Header (Floating Menu Button + Balance) - Only show on Home or when Menu is open */}
            {viewState === 'home' && !activeRide && (
                <div className="absolute top-4 left-4 right-4 z-40 flex items-center justify-between pointer-events-none">
                    <button
                        onClick={() => setIsMenuOpen(true)}
                        className="w-10 h-10 bg-[#1c272d]/90 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform border border-white/10 pointer-events-auto"
                    >
                        <span className="material-icons text-white">menu</span>
                    </button>

                    {/* Balance Badge in Header */}
                    <button
                        onClick={() => setActiveTab('wallet')}
                        className="bg-[#1c272d]/90 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/10 shadow-lg active:scale-95 transition-transform pointer-events-auto"
                    >
                        <span className="material-icons text-yellow-500 text-sm">stars</span>
                        <span className="text-yellow-500 font-bold text-sm tracking-tight">{currentUser.wallet_coins || 0}</span>
                    </button>
                </div>
            )}

            {/* Side Menu Drawer */}
            {isMenuOpen && (
                <>
                    <div
                        className="absolute inset-0 bg-black/60 z-50 backdrop-blur-sm transition-opacity"
                        onClick={() => setIsMenuOpen(false)}
                    ></div>
                    <div className="absolute top-0 left-0 bottom-0 w-[75%] max-w-[300px] bg-[#1c272d] z-[60] shadow-2xl flex flex-col border-r border-white/5 animate-slide-in-left">
                        <div className="p-8 bg-[#111b21] border-b border-white/5">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <img src={currentUser.avatar_url || "/logo.png"} className="w-14 h-14 rounded-full border-2 border-whatsapp-green object-cover" />
                                    <div>
                                        <h2 className="text-white font-bold text-lg leading-tight">{currentUser.username.split(' ')[0]}</h2>
                                        <p className="text-gray-400 text-xs text-yellow-500 flex items-center gap-1 font-bold mt-1">
                                            <span className="material-icons text-[12px]">star</span> 5.0
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Wallet Balance in Sidebar */}
                            <div className="bg-gradient-to-r from-yellow-500 to-orange-600 p-4 rounded-2xl shadow-lg shadow-orange-950/20 active:scale-95 transition-transform" onClick={() => { setActiveTab('wallet'); setIsMenuOpen(false); }}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                                            <span className="material-icons text-white text-lg">stars</span>
                                        </div>
                                        <div>
                                            <p className="text-white/60 text-[10px] font-black uppercase tracking-wider leading-none">Minhas Moedas</p>
                                            <p className="text-white font-black text-xl leading-none mt-1">{currentUser.wallet_coins || 0}</p>
                                        </div>
                                    </div>
                                    <span className="material-icons text-white/50 text-sm">chevron_right</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                            <MenuItem icon="map" label="Mapa" active={activeTab === 'home'} onClick={() => { setActiveTab('home'); setIsMenuOpen(false); }} />
                            <MenuItem icon="person" label="Perfil" active={activeTab === 'profile'} onClick={() => { setActiveTab('profile'); setIsMenuOpen(false); }} />
                            <MenuItem icon="people" label="Motoristas" active={activeTab === 'drivers'} onClick={() => { setActiveTab('drivers'); setIsMenuOpen(false); }} />
                            <MenuItem icon="account_balance_wallet" label="Carteira" active={activeTab === 'wallet'} onClick={() => { setActiveTab('wallet'); setIsMenuOpen(false); }} />
                            <MenuItem icon="card_giftcard" label="Prêmios" active={activeTab === 'rewards'} onClick={() => { setActiveTab('rewards'); setIsMenuOpen(false); }} />
                            <div className="h-px bg-white/5 my-3 mx-4"></div>
                            <MenuItem icon="style" label="Bingo" onClick={() => { onOpenBingo(); setIsMenuOpen(false); }} />
                        </div>

                        {/* Logout Button */}
                        <div className="px-3 pb-4">
                            <button
                                onClick={onLogout}
                                className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg"
                            >
                                <span className="material-icons text-sm">logout</span>
                                Sair
                            </button>
                        </div>

                        <div className="p-6 border-t border-white/5">
                            <p className="text-center text-gray-600 text-[10px] font-bold uppercase tracking-widest">ChegoJá v4.5.1</p>
                        </div>
                    </div>
                </>
            )}

            {/* ---------------------------------------------------------------------------------- */}
            {/* VIEW: HOME (Map + Search Bar) */}
            {viewState === 'home' && activeTab === 'home' && !activeRide && (
                <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
                    <div className="flex-1 relative pointer-events-auto">
                        <AppMap drivers={nearbyDrivers} userLocation={userLocation} onMarkerClick={onStartChat} settings={settings} />
                        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-white/80 to-transparent z-10 pointer-events-none"></div>

                        {/* Ad Banner Overlay - Sobrepondo o mapa */}
                        <div className="absolute top-4 left-4 right-4 z-20 pointer-events-auto">
                            <AdBanner />
                        </div>

                        {/* Home Bottom Sheet - Light Theme */}
                        <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[32px] shadow-[0_-8px_32px_rgba(0,0,0,0.15)] z-40 p-6 pb-8 flex flex-col gap-4 border-t border-gray-200 animate-slide-up pointer-events-auto">
                            <div className="flex justify-between items-end mb-2">
                                <div>
                                    <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Bom dia, {currentUser.username.split(' ')[0]}!</h3>
                                    <h1 className="text-gray-900 text-2xl font-black tracking-tight">Para onde vamos?</h1>
                                </div>
                            </div>

                            {/* Main Search Input Trigger */}
                            <button
                                onClick={startSearch}
                                type="button"
                                className="w-full bg-gray-100 rounded-2xl p-4 flex items-center gap-3 active:scale-[0.98] transition-all border border-gray-200 shadow-sm cursor-pointer hover:bg-gray-200"
                            >
                                <span className="material-icons text-blue-600">search</span>
                                <p className="text-gray-600 text-sm font-medium w-full text-left">Escolher destino</p>
                            </button>

                            {/* Recent/History Placeholder */}
                            <div className="space-y-2 mt-2">
                                <div className="flex items-center gap-3 p-2 opacity-50">
                                    <span className="material-icons text-gray-500 text-sm">history</span>
                                    <p className="text-gray-500 text-xs">Seus destinos recentes aparecerão aqui.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Bottom Navigation Only on Home */}
                    {/* Included at the end of component but we can hide it in other states */}
                </div>
            )}


            {/* ---------------------------------------------------------------------------------- */}
            {/* VIEW: SEARCH INPUT (Full Screen) */}
            {viewState === 'search_input' && (
                <div className="absolute inset-0 bg-white z-[100] flex flex-col animate-fade-in">
                    {/* Header */}
                    <div className="p-4 flex items-center gap-4 bg-white shadow-sm border-b border-gray-200">
                        <button onClick={() => setViewState('home')} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100">
                            <span className="material-icons text-gray-900">arrow_back</span>
                        </button>
                        <h2 className="text-gray-900 font-bold text-lg">Escolha seu destino</h2>
                    </div>

                    {/* Inputs Section */}
                    <div className="p-4 space-y-4">
                        <div className="flex gap-3 relative">
                            {/* Graphic Connector */}
                            <div className="flex flex-col items-center pt-4 w-6">
                                <div className="w-3 h-3 rounded-full border-2 border-gray-400 bg-white mb-1"></div>
                                <div className="w-0.5 flex-1 bg-gray-300 my-1"></div>
                                <div className="w-3 h-3 rounded-full bg-blue-600 border-2 border-blue-200 mt-1"></div>
                            </div>

                            {/* Fields */}
                            <div className="flex-1 space-y-4">
                                {/* Origin */}
                                <div className="relative">
                                    <div className="bg-gray-100 p-3 rounded-xl border border-gray-200">
                                        <p className="text-[10px] text-gray-600 uppercase font-bold mb-1">Partida</p>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={currentAddress}
                                                onChange={(e) => handleSearch(e.target.value, 'origin')}
                                                onFocus={() => setActiveField('origin')}
                                                className="bg-transparent flex-1 text-gray-900 text-sm font-medium outline-none placeholder-gray-500"
                                                placeholder="Minha localização"
                                            />
                                            {currentAddress !== 'Obtendo localização...' && (
                                                <button
                                                    onClick={() => {
                                                        if (navigator.geolocation) {
                                                            setCurrentAddress('Atualizando...');
                                                            navigator.geolocation.getCurrentPosition(async (pos) => {
                                                                setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                                                                const addr = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
                                                                if (addr) {
                                                                    setCurrentAddress(addr);
                                                                    isManualOrigin.current = false;
                                                                }
                                                            });
                                                        }
                                                    }}
                                                    className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center hover:bg-blue-200 transition shrink-0"
                                                    title="Atualizar localização"
                                                >
                                                    <span className="material-icons text-blue-600 text-xs">my_location</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Destination */}
                                <div className="bg-blue-50 p-3 rounded-xl border border-blue-300 ring-1 ring-blue-200">
                                    <p className="text-[10px] text-blue-700 uppercase font-bold mb-1">Destino</p>
                                    <input
                                        type="text"
                                        value={destinationText}
                                        onChange={(e) => handleSearch(e.target.value, 'destination')}
                                        onFocus={() => setActiveField('destination')}
                                        autoFocus
                                        className="bg-transparent w-full text-gray-900 text-sm font-medium outline-none placeholder-gray-500"
                                        placeholder="Para onde?"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Suggestions List */}
                    <div className="flex-1 overflow-y-auto px-2">
                        {/* Show search results if typing, otherwise show recent addresses */}
                        {(suggestions.length > 0 || recentAddresses.length > 0) ? (
                            <>
                                {/* Show suggestions when actively searching */}
                                {suggestions.length > 0 && suggestions.map((item) => (
                                    <div
                                        key={item.place_id}
                                        onClick={() => handleSelectAddress(item)}
                                        className="p-4 border-b border-gray-200 flex items-center gap-4 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer"
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${item.isHistory ? 'bg-yellow-100 text-yellow-600' : 'bg-blue-100 text-blue-600'}`}>
                                            <span className="material-icons text-sm">{item.isHistory ? 'history' : 'place'}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-gray-900 text-sm font-bold truncate">{item.description.split(',')[0]}</p>
                                            <p className="text-gray-600 text-xs truncate">{item.description}</p>
                                            {item.isHistory && <p className="text-[9px] text-yellow-700 uppercase mt-0.5">Sugerido pelo Histórico</p>}
                                        </div>
                                        <span className="material-icons text-gray-400 text-lg">chevron_right</span>
                                    </div>
                                ))}

                                {/* Show recent addresses when not searching */}
                                {suggestions.length === 0 && recentAddresses.length > 0 && (
                                    <>
                                        <div className="p-3 px-4">
                                            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Endereços Recentes</p>
                                        </div>
                                        {recentAddresses.map((item) => (
                                            <div
                                                key={item.place_id}
                                                onClick={() => handleSelectAddress(item)}
                                                className="p-4 border-b border-white/5 flex items-center gap-4 hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer"
                                            >
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-yellow-500/10 text-yellow-500">
                                                    <span className="material-icons text-sm">history</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white text-sm font-bold truncate">{item.description.split(',')[0]}</p>
                                                    <p className="text-gray-500 text-xs truncate">{item.description}</p>
                                                </div>
                                                <span className="material-icons text-gray-600 text-lg">chevron_right</span>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 px-6">
                                <span className="material-icons text-gray-700 text-6xl mb-4">search_off</span>
                                <p className="text-gray-500 text-sm text-center">
                                    {destinationText ? 'Nenhum resultado encontrado' : 'Digite um endereço para buscar'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}


            {/* ---------------------------------------------------------------------------------- */}
            {/* VIEW: CONFIRMATION (Check Location) & VEHICLE SELECT */}
            {(viewState === 'location_check' || viewState === 'vehicle_select') && destination && (
                <div className="absolute inset-0 z-[50] flex flex-col bg-white">
                    <div className="flex-1 relative">
                        {/* Map with Route */}
                        <AppMap
                            drivers={nearbyDrivers}
                            userLocation={userLocation}
                            settings={settings}
                            showRoute={true}
                            routeOrigin={userLocation}
                            routeDestination={destination}
                            onRouteInfo={(info) => {
                                // Store route info if needed
                            }}
                        />

                        {/* Top Floating Route Card */}
                        <div className="absolute top-4 left-4 right-4 z-20">
                            <div className="bg-white rounded-2xl p-4 shadow-xl border border-gray-200 flex flex-col gap-3 animate-slide-down">
                                <div className="flex items-start gap-3 relative">
                                    <div className="flex flex-col items-center pt-1.5 h-full absolute left-0 top-0 bottom-0">
                                        <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                                        <div className="w-0.5 h-8 bg-gray-300 my-1"></div>
                                        <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                                    </div>
                                    <div className="flex-1 space-y-4 pl-5">
                                        <div>
                                            <p className="text-[10px] text-gray-500 uppercase font-bold leading-none mb-1">Partida</p>
                                            <p className="text-gray-900 text-xs font-bold truncate pr-8">{currentAddress || 'Loc. Atual'}</p>
                                        </div>
                                        <div className="h-px bg-gray-200 w-full"></div>
                                        <div>
                                            <p className="text-[10px] text-blue-700 uppercase font-bold leading-none mb-1">Destino</p>
                                            <p className="text-gray-900 text-xs font-bold truncate pr-8">{destination.address}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setViewState('search_input')} className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-900">
                                        <span className="material-icons text-sm">edit</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Distance & Time Card - Floating on Map Center (similar to reference image) */}
                        {(viewState === 'vehicle_select' || viewState === 'location_check') && estimates && (
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none animate-fade-in">
                                <div className="bg-gray-900 text-white px-4 py-2.5 rounded-full shadow-xl flex items-center gap-2 font-bold text-sm">
                                    <span className="material-icons text-base">route</span>
                                    <span>{estimates.distance.toFixed(1)} KM • {Math.round(estimates.time)} MIN</span>
                                </div>
                            </div>
                        )}

                        {/* STEP A: CONFIRM LOCATION BUTTON */}
                        {viewState === 'location_check' && (
                            <div className="absolute bottom-6 left-6 right-6 z-30 animate-slide-up">
                                <button
                                    onClick={confirmLocation}
                                    className="w-full bg-whatsapp-green hover:bg-[#00a884] text-white py-4 rounded-2xl font-black text-sm uppercase tracking-wider shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                >
                                    Confirmar Local <span className="material-icons text-sm">check_circle</span>
                                </button>
                            </div>
                        )}

                        {/* STEP B: VEHICLE SELECTION BOTTOM SHEET */}
                        {viewState === 'vehicle_select' && (
                            <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[32px] shadow-[0_-8px_32px_rgba(0,0,0,0.15)] z-30 overflow-hidden flex flex-col max-h-[60%] animate-slide-up border-t border-gray-200">
                                <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                                    <h3 className="text-gray-900 font-bold text-sm pl-2">Escolha como viajar</h3>
                                    <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-1 rounded-lg font-bold">Opcionais</span>
                                </div>

                                <div className="overflow-y-auto p-4 space-y-3 pb-safe-area">
                                    {/* Available Coupons Section */}
                                    {coupons.length > 0 && (
                                        <div className="mb-6">
                                            <h4 className="text-gray-900 font-black text-[10px] uppercase tracking-widest mb-3 px-1">Cupons Disponíveis</h4>
                                            <div className="flex overflow-x-auto pb-4 gap-3 snap-x scrollbar-hide -mx-1 px-1">
                                                {coupons.map((coupon) => (
                                                    <div
                                                        key={coupon.id}
                                                        onClick={() => {
                                                            if (selectedCoupon?.id === coupon.id) {
                                                                setSelectedCoupon(null);
                                                            } else {
                                                                setSelectedCoupon(coupon);
                                                            }
                                                        }}
                                                        className={`
                                                            min-w-[150px] w-[150px] snap-start
                                                            bg-emerald-50/60
                                                            border-2 rounded-[24px] p-3 cursor-pointer 
                                                            transition-all active:scale-[0.98] flex flex-col gap-2
                                                            ${selectedCoupon?.id === coupon.id
                                                                ? 'border-green-600 shadow-lg shadow-green-100'
                                                                : 'border-green-100 hover:border-green-200'}
                                                        `}
                                                    >
                                                        {/* Coupon Badge/Image */}
                                                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/80 flex items-center justify-center border border-green-100 shrink-0">
                                                            {coupon.image_url ? (
                                                                <img src={coupon.image_url} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span className="material-icons text-green-600 text-xl">local_offer</span>
                                                            )}
                                                        </div>

                                                        {/* Coupon Info */}
                                                        <div className="flex-1">
                                                            <p className="text-gray-900 font-black text-sm leading-tight">
                                                                R$ {coupon.discount_value.toFixed(2)} OFF
                                                            </p>
                                                            <p className="text-gray-500 text-[8px] uppercase font-bold tracking-tight mt-0.5 leading-none">
                                                                Válido para: {coupon.vehicle_type === 'all' ? 'Qualquer veículo' : (coupon.vehicle_type === 'car' ? 'Carro' : 'Moto')}
                                                            </p>
                                                        </div>

                                                        {/* Action Row */}
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <button
                                                                className={`flex-1 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-colors ${selectedCoupon?.id === coupon.id
                                                                    ? 'bg-green-600 text-white'
                                                                    : 'bg-white border border-green-200 text-green-700 hover:bg-green-50'
                                                                    }`}
                                                            >
                                                                {selectedCoupon?.id === coupon.id ? 'Aplicado' : 'Aplicar'}
                                                            </button>

                                                            <div className="w-8 h-8 rounded-xl bg-white border border-red-50 flex items-center justify-center group/del" onClick={(e) => {
                                                                e.stopPropagation();
                                                                // If you want actual deletion logic here, otherwise it's just visual.
                                                                // Since it's in the client dashboard, maybe just a "hide" or "not interested".
                                                            }}>
                                                                <span className="material-icons text-gray-300 group-hover/del:text-red-500 text-sm">delete</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Car Option */}
                                    <div
                                        onClick={() => setSelectedVehicleType('car')}
                                        className={`bg-gray-100 border-2 ${selectedVehicleType === 'car' ? 'border-blue-500 bg-blue-50/30' : 'border-gray-200'} rounded-2xl p-4 flex items-center justify-between cursor-pointer active:scale-[0.99] transition-all group shadow-sm`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="relative">
                                                <img
                                                    src={settings?.car_icon_url || "/images/car_icon_3d.png"}
                                                    className="w-16 h-16 object-contain drop-shadow-lg group-hover:scale-110 transition-transform"
                                                    onError={(e) => (e.currentTarget.src = 'https://cdn-icons-png.flaticon.com/512/3097/3097180.png')}
                                                />
                                                {selectedVehicleType === 'car' && (
                                                    <div className="absolute -top-1 -right-1 bg-blue-600 text-white rounded-full p-0.5 shadow-md">
                                                        <span className="material-icons text-[12px]">check</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-gray-900 font-black text-sm">{settings?.car_name || 'Mob Comum'}</h3>
                                                    <span className="material-icons text-gray-500 text-[10px]">person</span>
                                                    <span className="text-gray-600 text-xs font-bold">4</span>
                                                </div>
                                                <p className="text-gray-600 text-[10px] uppercase font-black tracking-tighter">{settings?.car_description || 'Viagem econômica'}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            {(() => {
                                                const basePrice = estimates ? estimates.car : (settings?.car_base_price || 0);
                                                let finalPrice = basePrice;
                                                const hasDiscount = selectedCoupon && (selectedCoupon.vehicle_type === 'all' || selectedCoupon.vehicle_type === 'car');

                                                if (hasDiscount) {
                                                    const disc = selectedCoupon.discount_value;
                                                    finalPrice = Math.max(0, basePrice - disc);
                                                }

                                                return (
                                                    <>
                                                        {hasDiscount && (
                                                            <p className="text-gray-400 line-through text-[10px] font-bold">R$ {basePrice.toFixed(2)}</p>
                                                        )}
                                                        <p className="text-blue-600 font-black text-lg">R$ {finalPrice.toFixed(2)}</p>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>

                                    {/* Moto Option */}
                                    <div
                                        onClick={() => setSelectedVehicleType('motorcycle')}
                                        className={`bg-gray-100 border-2 ${selectedVehicleType === 'motorcycle' ? 'border-orange-500 bg-orange-50/30' : 'border-gray-200'} rounded-2xl p-4 flex items-center justify-between cursor-pointer active:scale-[0.99] transition-all group shadow-sm`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="relative">
                                                <img
                                                    src={settings?.moto_icon_url || "/images/moto_icon_3d.png"}
                                                    className="w-16 h-16 object-contain drop-shadow-lg group-hover:scale-110 transition-transform"
                                                    onError={(e) => (e.currentTarget.src = 'https://cdn-icons-png.flaticon.com/512/3233/3233315.png')}
                                                />
                                                {selectedVehicleType === 'motorcycle' && (
                                                    <div className="absolute -top-1 -right-1 bg-orange-500 text-white rounded-full p-0.5 shadow-md">
                                                        <span className="material-icons text-[12px]">check</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-gray-900 font-black text-sm">{settings?.moto_name || 'Mob Moto'}</h3>
                                                    <span className="material-icons text-gray-500 text-[10px]">person</span>
                                                    <span className="text-gray-600 text-xs font-bold">1</span>
                                                </div>
                                                <p className="text-gray-600 text-[10px] uppercase font-black tracking-tighter">{settings?.moto_description || 'Rapidez e agilidade'}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            {(() => {
                                                const basePrice = estimates ? estimates.motorcycle : (settings?.moto_base_price || 0);
                                                let finalPrice = basePrice;
                                                const hasDiscount = selectedCoupon && (selectedCoupon.vehicle_type === 'all' || selectedCoupon.vehicle_type === 'motorcycle');

                                                if (hasDiscount) {
                                                    const disc = selectedCoupon.discount_value;
                                                    finalPrice = Math.max(0, basePrice - disc);
                                                }

                                                return (
                                                    <>
                                                        {hasDiscount && (
                                                            <p className="text-gray-400 line-through text-[10px] font-bold">R$ {basePrice.toFixed(2)}</p>
                                                        )}
                                                        <p className="text-orange-600 font-black text-lg">R$ {finalPrice.toFixed(2)}</p>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>

                                    {/* Test Mode: Selective Driver Dispatch */}
                                    <div className="mt-4 pt-4 border-t border-gray-100">
                                        <div className="flex items-center justify-between mb-3 px-1">
                                            <div className="flex flex-col">
                                                <h4 className="text-gray-900 font-black text-[10px] uppercase tracking-widest">Enviar para motorista específico</h4>
                                                <p className="text-blue-600 text-[8px] font-bold uppercase">Modo de Teste / Direcionado</p>
                                            </div>
                                            {targetDriverId && (
                                                <button
                                                    onClick={() => setTargetDriverId(null)}
                                                    className="text-[9px] font-bold text-red-500 uppercase hover:underline"
                                                >
                                                    Limpar Seleção
                                                </button>
                                            )}
                                        </div>

                                        <div className="flex overflow-x-auto pb-2 gap-3 scrollbar-hide">
                                            {nearbyDrivers.length === 0 ? (
                                                <p className="text-gray-400 text-[10px] italic px-1">Nenhum motorista online para selecionar.</p>
                                            ) : (
                                                nearbyDrivers.map(driver => (
                                                    <div
                                                        key={driver.id}
                                                        onClick={() => setTargetDriverId(driver.id)}
                                                        className={`
                                                            min-w-[120px] p-2 rounded-xl border-2 transition-all cursor-pointer flex flex-col items-center text-center gap-1.5
                                                            ${targetDriverId === driver.id
                                                                ? 'border-blue-600 bg-blue-50'
                                                                : 'border-gray-100 hover:border-gray-200'}
                                                        `}
                                                    >
                                                        <div className="relative">
                                                            <img
                                                                src={driver.avatar_url || "/logo.png"}
                                                                className="w-10 h-10 rounded-full object-cover border border-gray-200"
                                                            />
                                                            {targetDriverId === driver.id && (
                                                                <div className="absolute -top-1 -right-1 bg-blue-600 text-white rounded-full p-0.5 shadow-sm">
                                                                    <span className="material-icons text-[10px]">check</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="min-w-0 w-full">
                                                            <p className="text-gray-900 font-bold text-[10px] truncate">{driver.username}</p>
                                                            <p className="text-gray-500 text-[8px] leading-tight truncate">{driver.vehicle_model || (driver.vehicle_type === 'car' ? 'Carro' : 'Moto')}</p>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>

                                    {/* Payment Method Selector */}
                                    <button
                                        onClick={() => {
                                            // Toggle payment selector
                                            const methods: Array<'cash' | 'pix' | 'card' | 'coins'> = ['cash', 'pix', 'card', 'coins'];
                                            const currentIndex = methods.indexOf(paymentMethod);
                                            const nextIndex = (currentIndex + 1) % methods.length;
                                            setPaymentMethod(methods[nextIndex]);
                                        }}
                                        className="flex items-center gap-3 py-2 px-1 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer active:scale-[0.98]"
                                    >
                                        <div className={`w-6 h-6 rounded flex items-center justify-center ${paymentMethod === 'cash' ? 'bg-green-100' :
                                            paymentMethod === 'pix' ? 'bg-teal-100' :
                                                paymentMethod === 'card' ? 'bg-blue-100' :
                                                    'bg-yellow-100'
                                            }`}>
                                            <span className={`material-icons text-xs ${paymentMethod === 'cash' ? 'text-green-600' :
                                                paymentMethod === 'pix' ? 'text-teal-600' :
                                                    paymentMethod === 'card' ? 'text-blue-600' :
                                                        'text-yellow-600'
                                                }`}>
                                                {paymentMethod === 'cash' ? 'attach_money' :
                                                    paymentMethod === 'pix' ? 'pix' :
                                                        paymentMethod === 'card' ? 'credit_card' :
                                                            'stars'}
                                            </span>
                                        </div>
                                        <div className="flex-1 text-left">
                                            <p className="text-gray-900 font-bold text-xs">
                                                {paymentMethod === 'cash' ? 'Dinheiro' :
                                                    paymentMethod === 'pix' ? 'PIX' :
                                                        paymentMethod === 'card' ? 'Cartão' :
                                                            'Moedas do App'}
                                            </p>
                                            <p className="text-gray-600 text-[10px]">
                                                {paymentMethod === 'coins'
                                                    ? `Saldo: ${currentUser.wallet_coins || 0} moedas • Toque para trocar`
                                                    : 'Forma de pagamento • Toque para trocar'}
                                            </p>
                                        </div>
                                        <span className="material-icons text-gray-400 text-sm">sync</span>
                                    </button>

                                    {/* Main Action Button */}
                                    <button
                                        onClick={() => handleRequestRide(selectedVehicleType)}
                                        className={`w-full ${selectedVehicleType === 'car' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-500 hover:bg-orange-600'} text-white py-4 rounded-xl font-bold text-sm shadow-lg active:scale-[0.98] transition-all`}
                                    >
                                        Confirmar {selectedVehicleType === 'car' ? (settings?.car_name || 'Mob Comum') : (settings?.moto_name || 'Mob Moto')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ---------------------------------------------------------------------------------- */}
            {/* OTHER TABS: DRIVERS, REWARDS, WALLET (Same as before) */}
            <div className="flex-1 relative h-full flex flex-col pointer-events-none">
                {/* Only render these if activeTab is NOT home, to allow overlaying ViewStates on Home tab */}
                <div className="pointer-events-auto h-full flex flex-col">
                    {activeTab === 'drivers' && (
                        /* Drivers View */
                        <div className="p-6 space-y-8 animate-fade-in overflow-y-auto h-full pb-24 bg-[#111b21]">
                            <div className="flex items-center gap-4 mb-4">
                                <button onClick={() => setActiveTab('home')} className="material-icons text-white">arrow_back</button>
                                <div>
                                    <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-1">Motoristas</h2>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Disponíveis agora</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                {nearbyDrivers.length === 0 ? (
                                    <div className="text-center py-20 bg-[#1c272d]/40 rounded-[40px] border border-white/5 border-dashed">
                                        <span className="material-icons text-6xl text-gray-700 mb-4">no_accounts</span>
                                        <p className="font-bold text-gray-500 uppercase text-xs tracking-widest">Nenhum motorista online</p>
                                    </div>
                                ) : (
                                    nearbyDrivers.map(driver => (
                                        <div key={driver.id} onClick={() => onStartChat(driver)} className="bg-[#1c272d] border border-white/5 p-4 rounded-2xl flex items-center justify-between hover:bg-white/5">
                                            <div className="flex items-center gap-4">
                                                <img src={driver.avatar_url || "/logo.png"} className="w-12 h-12 rounded-full object-cover" />
                                                <div>
                                                    <h4 className="text-white font-bold">{driver.username}</h4>
                                                    <p className="text-gray-500 text-xs">{driver.vehicle_model} • {driver.vehicle_plate}</p>
                                                </div>
                                            </div>
                                            <button className="w-10 h-10 rounded-full bg-whatsapp-green text-white flex items-center justify-center shadow-lg"><span className="material-icons">chat</span></button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* Profile View */}
                    {activeTab === 'profile' && (
                        <div className="h-full flex flex-col bg-white pb-safe-area">
                            {/* Header */}
                            <div className="p-4 flex items-center gap-4 bg-white border-b border-gray-200">
                                <button onClick={() => setActiveTab('home')} className="material-icons text-gray-900">arrow_back</button>
                                <h2 className="text-xl font-black text-gray-900 uppercase">Meu Perfil</h2>
                            </div>

                            {/* Profile Content */}
                            <div className="flex-1 overflow-y-auto p-4">
                                {/* Profile Picture */}
                                <div className="flex flex-col items-center mb-6">
                                    <div className="relative">
                                        <img
                                            src={currentUser.avatar_url || "/logo.png"}
                                            className="w-24 h-24 rounded-full border-4 border-blue-500 object-cover shadow-lg"
                                            alt="Foto de perfil"
                                        />
                                        <button
                                            onClick={async () => {
                                                const input = document.createElement('input');
                                                input.type = 'file';
                                                input.accept = 'image/*';
                                                input.onchange = async (e: any) => {
                                                    const file = e.target.files[0];
                                                    if (file) {
                                                        try {
                                                            // Use the storage service instead of base64
                                                            const fileName = `avatars/${currentUser.id}_${Date.now()}.jpg`;
                                                            const { data: uploadData, error: uploadError } = await supabase.storage
                                                                .from('chat-media')
                                                                .upload(fileName, file, { upsert: true });

                                                            if (uploadError) throw uploadError;

                                                            const { data: { publicUrl } } = supabase.storage
                                                                .from('chat-media')
                                                                .getPublicUrl(fileName);

                                                            const success = await updateUserProfile(currentUser.id, { avatar_url: publicUrl });
                                                            if (!success) throw new Error("Erro ao salvar URL no banco");

                                                            notify('Foto atualizada com sucesso!');
                                                            if (onUpdateUser) {
                                                                onUpdateUser({ ...currentUser, avatar_url: publicUrl });
                                                            }
                                                        } catch (err: any) {
                                                            console.error("Avatar error:", err);
                                                            notify('Erro ao atualizar foto: ' + (err.message || 'Desconhecido'));
                                                        }
                                                    }
                                                };
                                                input.click();
                                            }}
                                            className="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-blue-700 active:scale-95 transition-all"
                                        >
                                            <span className="material-icons text-sm">edit</span>
                                        </button>
                                    </div>
                                    <p className="mt-3 text-gray-900 font-bold text-lg">{currentUser.username}</p>
                                    <p className="text-gray-500 text-sm flex items-center gap-1">
                                        <span className="material-icons text-xs text-yellow-500">star</span> 5.0
                                    </p>
                                </div>

                                {/* Profile Form */}
                                <div className="space-y-4">
                                    <h3 className="text-gray-700 font-bold text-sm uppercase mb-3">Informações Pessoais</h3>

                                    {/* Nome e Sobrenome */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-gray-600 text-xs font-bold">Nome</label>
                                            <input
                                                type="text"
                                                defaultValue={currentUser.username?.split(' ')[0] || ''}
                                                className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                                placeholder="Seu nome"
                                                id="firstName"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-gray-600 text-xs font-bold">Sobrenome</label>
                                            <input
                                                type="text"
                                                defaultValue={currentUser.username?.split(' ').slice(1).join(' ') || ''}
                                                className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                                placeholder="Sobrenome"
                                                id="lastName"
                                            />
                                        </div>
                                    </div>

                                    {/* WhatsApp */}
                                    <div>
                                        <label className="text-gray-600 text-xs font-bold">WhatsApp</label>
                                        <input
                                            type="tel"
                                            defaultValue={currentUser.whatsapp || currentUser.phone || ''}
                                            className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                            placeholder="(00) 00000-0000"
                                            id="whatsapp"
                                        />
                                    </div>

                                    {/* CPF */}
                                    <div>
                                        <label className="text-gray-600 text-xs font-bold">CPF</label>
                                        <input
                                            type="text"
                                            defaultValue={(currentUser as any).cpf || ''}
                                            className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                            placeholder="000.000.000-00"
                                            id="cpf"
                                            maxLength={14}
                                        />
                                    </div>

                                    <h3 className="text-gray-700 font-bold text-sm uppercase mb-3 mt-6">Dados para Prêmios</h3>

                                    {/* PIX */}
                                    <div>
                                        <label className="text-gray-600 text-xs font-bold">Chave PIX</label>
                                        <input
                                            type="text"
                                            defaultValue={currentUser.pix_key || ''}
                                            className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                            placeholder="CPF, e-mail, telefone ou chave aleatória"
                                            id="pixKey"
                                        />
                                        <p className="text-gray-500 text-xs mt-1">Para receber prêmios em dinheiro</p>
                                    </div>

                                    <h3 className="text-gray-700 font-bold text-sm uppercase mb-3 mt-6">Endereço</h3>

                                    {/* Endereço */}
                                    <div>
                                        <label className="text-gray-600 text-xs font-bold">Rua</label>
                                        <input
                                            type="text"
                                            defaultValue={(currentUser as any).address_street || ''}
                                            className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                            placeholder="Nome da rua"
                                            id="addressStreet"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-gray-600 text-xs font-bold">Número</label>
                                            <input
                                                type="text"
                                                defaultValue={(currentUser as any).address_number || ''}
                                                className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                                placeholder="Nº"
                                                id="addressNumber"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-gray-600 text-xs font-bold">Bairro</label>
                                            <input
                                                type="text"
                                                defaultValue={(currentUser as any).address_neighborhood || ''}
                                                className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                                placeholder="Bairro"
                                                id="addressNeighborhood"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-gray-600 text-xs font-bold">Cidade</label>
                                            <input
                                                type="text"
                                                defaultValue={(currentUser as any).address_city || ''}
                                                className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                                placeholder="Cidade"
                                                id="addressCity"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-gray-600 text-xs font-bold">CEP</label>
                                            <input
                                                type="text"
                                                defaultValue={(currentUser as any).address_zip || ''}
                                                className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                                placeholder="00000-000"
                                                id="addressZip"
                                                maxLength={9}
                                            />
                                        </div>
                                    </div>

                                    {/* Save Button */}
                                    <button
                                        onClick={async () => {
                                            const firstName = (document.getElementById('firstName') as HTMLInputElement)?.value;
                                            const lastName = (document.getElementById('lastName') as HTMLInputElement)?.value;
                                            const whatsapp = (document.getElementById('whatsapp') as HTMLInputElement)?.value;
                                            const cpf = (document.getElementById('cpf') as HTMLInputElement)?.value;
                                            const pixKey = (document.getElementById('pixKey') as HTMLInputElement)?.value;
                                            const addressStreet = (document.getElementById('addressStreet') as HTMLInputElement)?.value;
                                            const addressNumber = (document.getElementById('addressNumber') as HTMLInputElement)?.value;
                                            const addressNeighborhood = (document.getElementById('addressNeighborhood') as HTMLInputElement)?.value;
                                            const addressCity = (document.getElementById('addressCity') as HTMLInputElement)?.value;
                                            const addressZip = (document.getElementById('addressZip') as HTMLInputElement)?.value;

                                            const fullName = `${firstName} ${lastName}`.trim();

                                            const updateData = {
                                                username: fullName || currentUser.username,
                                                whatsapp: whatsapp || null,
                                                cpf: cpf || null,
                                                pix_key: pixKey || null,
                                                address_street: addressStreet || null,
                                                address_number: addressNumber || null,
                                                address_neighborhood: addressNeighborhood || null,
                                                address_city: addressCity || null,
                                                address_zip: addressZip || null,
                                            };

                                            const success = await updateUserProfile(currentUser.id, updateData);

                                            if (!success) {
                                                notify('Erro ao salvar perfil. Verifique sua conexão.');
                                            } else {
                                                const updatedUser = {
                                                    ...currentUser,
                                                    ...updateData,
                                                    // Garantir que campos vazios persistam como null no state local também se for o caso,
                                                    // ou manter os originais se forem falsy mas quisermos manter? 
                                                    // Aqui o updateData já tem || null para os campos opcionais.
                                                };
                                                notify('Perfil atualizado com sucesso!');
                                                if (onUpdateUser) {
                                                    onUpdateUser(updatedUser as UserProfile);
                                                }
                                            }
                                        }}
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold text-sm shadow-lg active:scale-[0.98] transition-all mt-6"
                                    >
                                        Salvar Alterações
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'rewards' && (
                        /* Rewards View */
                        <div className="h-full flex flex-col bg-[#111b21] pb-safe-area">
                            <div className="p-4 flex items-center gap-4">
                                <button onClick={() => setActiveTab('home')} className="material-icons text-white">arrow_back</button>
                                <h2 className="text-xl font-black text-white uppercase">Prêmios & Cupons</h2>
                            </div>
                            <RewardsHub currentUser={currentUser} onClose={() => setActiveTab('home')} onUpdateUser={() => { }} />
                        </div>
                    )}

                    {activeTab === 'wallet' && (
                        /* Wallet View */
                        <div className="p-6 space-y-8 animate-fade-in overflow-y-auto h-full pb-24 bg-[#111b21]">
                            <div className="flex items-center gap-4 mb-4">
                                <button onClick={() => setActiveTab('home')} className="material-icons text-white">arrow_back</button>
                                <h2 className="text-2xl font-black text-white uppercase">Minha Carteira</h2>
                            </div>

                            <div className="bg-gradient-to-br from-[#00a884] to-[#017561] rounded-[32px] p-8 shadow-2xl relative overflow-hidden">
                                <div className="relative z-10 text-center">
                                    <p className="text-white/70 text-xs font-bold uppercase tracking-widest mb-2">Saldo Disponível</p>
                                    <h3 className="text-4xl font-black text-white">R$ {currentUser.financial_balance?.toFixed(2) || '0.00'}</h3>
                                    <div className="mt-6 flex gap-4 justify-center">
                                        <div className="bg-black/20 px-4 py-2 rounded-full"><span className="text-white font-bold">{currentUser.wallet_coins || 0} Moedas</span></div>
                                    </div>
                                </div>
                            </div>

                            <button onClick={onOpenWallet} className="w-full bg-[#1c272d] p-4 rounded-xl text-white font-bold flex items-center justify-between border border-white/5">
                                <span>Ver Extrato Completo</span>
                                <span className="material-icons">chevron_right</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Premium Bottom Navigation - HIDDEN for cleaner home design */}
            {/* The menu is now accessible via the hamburger menu button */}
            {false && viewState === 'home' && !activeRide && (
                <div className="fixed bottom-4 left-3 right-3 z-[40] pb-safe-area animate-slide-up">
                    <div className="bg-[#121b22]/95 backdrop-blur-xl border border-white/10 rounded-[32px] h-[74px] grid grid-cols-5 items-center justify-items-center shadow-[0_8px_32px_rgba(0,0,0,0.6)] relative">
                        <button onClick={() => setActiveTab('home')} className={`w-full h-full flex flex-col items-center justify-center gap-1.5 transition-all active:scale-90 ${activeTab === 'home' ? 'text-whatsapp-green' : 'text-gray-500 opacity-60'}`}>
                            <span className="material-icons text-[26px]">{activeTab === 'home' ? 'home' : 'home'}</span>
                            <span className="text-[9px] font-bold uppercase tracking-tight">Início</span>
                            {activeTab === 'home' && <div className="absolute bottom-2 w-1 h-1 bg-whatsapp-green rounded-full shadow-[0_0_8px_currentColor]"></div>}
                        </button>
                        <button onClick={() => setActiveTab('drivers')} className={`w-full h-full flex flex-col items-center justify-center gap-1.5 transition-all active:scale-90 ${activeTab === 'drivers' ? 'text-whatsapp-green' : 'text-gray-500 opacity-60'}`}>
                            <span className="material-icons text-[26px]">{activeTab === 'drivers' ? 'people' : 'people_outline'}</span>
                            <span className="text-[9px] font-bold uppercase tracking-tight">Drivers</span>
                            {activeTab === 'drivers' && <div className="absolute bottom-2 w-1 h-1 bg-whatsapp-green rounded-full shadow-[0_0_8px_currentColor]"></div>}
                        </button>
                        <div className="relative w-full h-full flex items-center justify-center">
                            <div className="absolute -top-[34px] left-1/2 -translate-x-1/2 w-[72px] h-[72px] rounded-full p-[4px] bg-[#121b22] shadow-[0_-4px_16px_rgba(0,0,0,0.3)] rounded-full clip-circle">
                                <button onClick={() => onOpenWallet && onOpenWallet()} className="w-full h-full rounded-full bg-gradient-to-br from-yellow-400 via-orange-500 to-yellow-600 flex items-center justify-center shadow-lg active:scale-95 transition-transform"><span className="material-icons text-white text-[32px] drop-shadow-md animate-pulse">casino</span></button>
                            </div>
                            <span className={`absolute bottom-2 text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === 'rewards' ? 'text-yellow-400' : 'text-gray-500/80'}`}>Prêmios</span>
                        </div>
                        <button onClick={() => setActiveTab('wallet')} className={`w-full h-full flex flex-col items-center justify-center gap-1.5 transition-all active:scale-90 ${activeTab === 'wallet' ? 'text-whatsapp-green' : 'text-gray-500 opacity-60'}`}>
                            <span className="material-icons text-[26px]">{activeTab === 'wallet' ? 'account_balance_wallet' : 'account_balance_wallet'}</span>
                            <span className="text-[9px] font-bold uppercase tracking-tight">Carteira</span>
                            {activeTab === 'wallet' && <div className="absolute bottom-2 w-1 h-1 bg-whatsapp-green rounded-full shadow-[0_0_8px_currentColor]"></div>}
                        </button>
                        <button onClick={onOpenBingo} className="w-full h-full flex flex-col items-center justify-center gap-1.5 transition-all active:scale-90 text-gray-500 opacity-60 hover:opacity-100">
                            <span className="material-icons text-[26px]">style</span>
                            <span className="text-[9px] font-bold uppercase tracking-tight">Bingo</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Ride Status Overlay */}
            {activeRide && (
                <div className="absolute inset-0 z-[200]">
                    <RideStatusOverlay
                        ride={activeRide}
                        onCancel={handleCancelRide}
                        onChat={() => {
                            if (activeRide.driver) onStartChat(activeRide.driver);
                        }}
                        settings={settings}
                        currentUser={currentUser}
                    />
                </div>
            )}

            {/* Aviso de demora na busca (90s sem motorista) */}
            {activeRide?.status === 'searching' && searchTimedOut && (
                <div className="absolute inset-x-0 bottom-0 z-[210] p-4 animate-slide-up">
                    <div className="bg-[#1c272d] border border-yellow-500/30 rounded-3xl p-5 shadow-2xl">
                        <div className="flex items-center gap-3 mb-3">
                            <span className="material-icons text-yellow-500">hourglass_empty</span>
                            <div>
                                <p className="text-white font-bold text-sm">Nenhum motorista ainda</p>
                                <p className="text-gray-400 text-xs">Os motoristas próximos podem estar ocupados.</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleCancelRide}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold text-sm active:scale-[0.98] transition-all"
                            >
                                Cancelar corrida
                            </button>
                            <button
                                onClick={() => setSearchTimedOut(false)}
                                className="flex-1 bg-whatsapp-green hover:bg-[#00a884] text-white py-3 rounded-xl font-bold text-sm active:scale-[0.98] transition-all"
                            >
                                Continuar aguardando
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
