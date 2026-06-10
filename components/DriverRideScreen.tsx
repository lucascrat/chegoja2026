import React, { useState, useEffect, useRef } from 'react';
import { Ride, UserProfile, AppSettings, Message } from '../types';
import { AppMap } from './AppMap';
import { subscribeToMessages, fetchMessages, sendMessage } from '../services/supabaseClient';
import { soundService } from '../services/soundService';

interface DriverRideScreenProps {
    ride: Ride;
    driver: UserProfile;
    settings: AppSettings | null;
    onStatusUpdate: (status: Ride['status']) => void;
    onChat: () => void;
    onMinimize?: () => void; // Callback quando motorista minimiza a tela
}

export const DriverRideScreen: React.FC<DriverRideScreenProps> = ({ ride, driver, settings, onStatusUpdate, onChat, onMinimize }) => {
    // Definir pontos de rota baseado no status
    const isGoingToClient = ride.status === 'accepted' || ride.status === 'en_route';
    const isGoingToDestination = ride.status === 'arrived' || ride.status === 'started';

    const routeOrigin = React.useMemo(() => ({
        lat: driver.lat || ride.origin_lat,
        lng: driver.lng || ride.origin_lng
    }), [driver.lat, driver.lng, ride.origin_lat, ride.origin_lng]);

    const routeDestination = React.useMemo(() => {
        const dest = isGoingToClient
            ? { lat: ride.origin_lat, lng: ride.origin_lng }
            : { lat: ride.destination_lat || ride.origin_lat, lng: ride.destination_lng || ride.origin_lng };
        return dest;
    }, [isGoingToClient, ride.origin_lat, ride.origin_lng, ride.destination_lat, ride.destination_lng]);

    // Estado do popup de mensagem
    const [showMessagePopup, setShowMessagePopup] = useState(false);
    const [popupMessages, setPopupMessages] = useState<Message[]>([]);
    const [replyText, setReplyText] = useState('');
    const [unreadCount, setUnreadCount] = useState(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Carregar mensagens e subscrever
    useEffect(() => {
        if (!ride.client?.id || !driver.id) return;

        // Carregar mensagens existentes
        const loadMessages = async () => {
            const msgs = await fetchMessages(driver.id, ride.client!.id);
            setPopupMessages(msgs);
        };
        loadMessages();

        // Subscrever a novas mensagens
        const sub = subscribeToMessages(driver.id, (newMsg) => {
            if (newMsg.sender_id === ride.client?.id || newMsg.receiver_id === ride.client?.id) {
                setPopupMessages(prev => {
                    if (prev.some(m => m.id === newMsg.id)) return prev;
                    return [...prev, newMsg];
                });

                // Se for mensagem do cliente e popup fechado, mostrar notificação
                if (newMsg.sender_id === ride.client?.id && !showMessagePopup) {
                    setUnreadCount(prev => prev + 1);
                    soundService.playReceived();
                    // Mostrar popup automaticamente
                    setShowMessagePopup(true);
                }
            }
        });

        return () => {
            sub.unsubscribe();
        };
    }, [driver.id, ride.client?.id, showMessagePopup]);

    // Scroll para última mensagem
    useEffect(() => {
        if (showMessagePopup && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [popupMessages, showMessagePopup]);

    // Enviar resposta rápida
    const handleSendReply = async () => {
        if (!replyText.trim() || !ride.client?.id) return;

        await sendMessage({
            sender_id: driver.id,
            receiver_id: ride.client.id,
            content: replyText.trim()
        });
        setReplyText('');
    };

    // Fechar popup e zerar contador
    const handleClosePopup = () => {
        setShowMessagePopup(false);
        setUnreadCount(0);
    };

    const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);

    // Header: Navigation Instruction (Mocking turn info for UI aesthetic)
    const instruction = isGoingToClient
        ? `Siga em direção ao cliente em ${ride.origin_address}`
        : `Siga para o destino final em ${ride.destination_address}`;

    return (
        <div className="fixed inset-0 z-[100] bg-[#0b141a] overflow-hidden">
            {/* Main Map View - Occupies full background */}
            <div className="absolute inset-0 z-0">
                <AppMap
                    drivers={[]}
                    userLocation={routeOrigin}
                    settings={settings}
                    showRoute={true}
                    routeOrigin={routeOrigin}
                    routeDestination={routeDestination}
                    navigationMode={true}
                    onRouteInfo={(info) => setRouteInfo(info)}
                />
            </div>

            {/* Top Navigation Bar - Overlayed */}
            <div className="absolute top-0 left-0 right-0 z-[110] p-3 pt-safe pointer-events-none">
                <div className="bg-[#005a4e]/95 backdrop-blur-md rounded-[22px] p-4 shadow-xl flex items-center gap-4 border border-white/10 pointer-events-auto">
                    <div className="bg-white/10 p-3 rounded-xl flex items-center justify-center">
                        <span className="material-icons text-white text-4xl leading-none">
                            {isGoingToClient ? 'turn_right' : 'straight'}
                        </span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-white text-2xl font-black">{routeInfo?.distance || '--'}</span>
                        </div>
                        <p className="text-white/80 text-sm font-bold truncate tracking-tight">
                            {isGoingToClient ? ride.origin_address : ride.destination_address}
                        </p>
                    </div>
                    <div className="bg-white/5 w-10 h-10 rounded-full flex items-center justify-center text-white/70">
                        <span className="material-icons text-xl">mic</span>
                    </div>
                </div>
            </div>

            {/* Left/Middle Overlays (Speedometer, etc) */}
            <div className="absolute left-3 top-32 z-20 pointer-events-none">
                <div className="bg-white/90 backdrop-blur-sm rounded-lg p-1.5 px-2 shadow-lg border border-gray-200 flex flex-col items-center">
                    <span className="text-black font-black text-xl leading-none">40</span>
                    <span className="text-gray-400 text-[7px] font-black uppercase">km/h</span>
                </div>
            </div>

            {/* Right Map Controls */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2.5 z-20">
                <button className="w-10 h-10 bg-black/70 backdrop-blur-sm rounded-full flex items-center justify-center text-white/80 border border-white/10 active:scale-90 transition">
                    <span className="material-icons text-lg">explore</span>
                </button>
                <button className="w-10 h-10 bg-black/70 backdrop-blur-sm rounded-full flex items-center justify-center text-white/80 border border-white/10 active:scale-90 transition">
                    <span className="material-icons text-lg">search</span>
                </button>
                <button className="w-10 h-10 bg-black/70 backdrop-blur-sm rounded-full flex items-center justify-center text-white/80 border border-white/10 active:scale-90 transition">
                    <span className="material-icons text-lg">volume_up</span>
                </button>
                <button className="w-10 h-10 bg-red-600/70 backdrop-blur-sm rounded-full flex items-center justify-center text-white/90 border border-white/10 active:scale-90 transition">
                    <span className="material-icons text-lg">priority_high</span>
                </button>
            </div>

            {/* Bottom Panel - Animated Overlay */}
            <div className="absolute bottom-0 left-0 right-0 z-[120] bg-[#0b141a] rounded-t-[32px] shadow-[0_-15px_40px_rgba(0,0,0,0.8)] border-t border-white/5 pb-safe animate-slide-up">
                <div className="px-5 py-4 space-y-4">
                    {/* Arrival Stats Bar - Positioned above the panel content */}
                    <div className="absolute -top-16 right-3 flex items-center gap-3">
                        <div className="bg-[#121212]/90 backdrop-blur-xl py-2 px-4 rounded-[16px] border border-white/10 shadow-xl flex items-center gap-3">
                            <div className="flex flex-col items-center border-r border-white/10 pr-3">
                                <span className="text-whatsapp-green text-xl font-black leading-none">{routeInfo?.duration.split(' ')[0] || '--'}</span>
                                <span className="text-gray-500 text-[8px] font-black uppercase tracking-tighter">{routeInfo?.duration.split(' ')[1] || 'min'}</span>
                            </div>
                            <div className="flex flex-col items-start px-1">
                                <span className="text-white text-sm font-bold leading-none">{routeInfo?.distance || '--'}</span>
                                <span className="text-gray-500 text-[8px] font-black uppercase tracking-tighter">Chegada</span>
                            </div>
                        </div>
                    </div>

                    <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mb-2"></div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl overflow-hidden border border-whatsapp-green/40 p-0.5">
                                <img
                                    src={ride.client?.avatar_url || `https://ui-avatars.com/api/?name=${ride.client?.username}`}
                                    className="w-full h-full object-cover rounded-[14px]"
                                    alt="Cliente"
                                />
                            </div>
                            <div>
                                <h4 className="text-white font-bold text-base leading-none mb-1.5">{ride.client?.username}</h4>
                                <span className="bg-whatsapp-green/20 text-whatsapp-green text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                                    R$ {ride.estimated_price?.toFixed(2)}
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowMessagePopup(true)}
                                className="w-11 h-11 bg-white/5 text-white rounded-xl flex items-center justify-center border border-white/5"
                            >
                                <span className="material-icons text-xl">chat</span>
                            </button>
                            <button
                                onClick={() => {
                                    const phone = ride.client?.phone?.replace(/\D/g, '');
                                    if (phone) window.open(`https://wa.me/55${phone}`, '_blank');
                                    else window.open(`tel:${ride.client?.phone}`);
                                }}
                                className="w-11 h-11 bg-white/5 text-whatsapp-green rounded-xl flex items-center justify-center border border-white/5"
                            >
                                <span className="material-icons text-xl">call</span>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={onMinimize}
                            className="py-3.5 bg-white/5 text-gray-400 font-black rounded-2xl border border-white/5 active:scale-95 text-[10px] uppercase tracking-widest"
                        >
                            Minimizar
                        </button>
                        {ride.status === 'accepted' || ride.status === 'en_route' ? (
                            <button
                                onClick={() => onStatusUpdate('arrived')}
                                className="py-3.5 bg-whatsapp-green text-black font-black rounded-2xl transition shadow-lg active:scale-95 text-[11px] uppercase tracking-widest"
                            >
                                Cheguei
                            </button>
                        ) : ride.status === 'finished' ? (
                            <div className="col-span-2 space-y-4 animate-slide-up">
                                <div className="bg-green-600/20 p-4 rounded-2xl border border-green-500/30 text-center">
                                    <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg shadow-green-500/20">
                                        <span className="material-icons text-3xl text-white">check_circle</span>
                                    </div>
                                    <h3 className="text-white font-black text-lg uppercase">Corrida Finalizada</h3>
                                    <p className="text-green-400 text-xs font-bold uppercase tracking-widest">Pagamento Confirmado</p>
                                    {ride.payment_method && (
                                        <div className="mt-2 text-xs text-gray-400">
                                            Via {ride.payment_method === 'pix' ? 'PIX' : ride.payment_method === 'card' ? 'Cartão' : 'Dinheiro'}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => onStatusUpdate('finished_ack' as any)}
                                    className="w-full py-4 bg-white/10 hover:bg-white/20 text-white font-black rounded-2xl transition active:scale-95 text-[11px] uppercase tracking-widest"
                                >
                                    Fechar e Voltar ao Mapa
                                </button>
                            </div>
                        ) : (
                            ride.status === 'waiting_payment' ? (
                                <div className="col-span-2 space-y-3 animate-slide-up">
                                    <div className="bg-white/5 p-3 px-4 rounded-2xl border border-white/10 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-whatsapp-green/20 rounded-xl flex items-center justify-center text-whatsapp-green">
                                                <span className="material-icons">
                                                    {ride.payment_method === 'pix' ? 'qr_code' :
                                                        ride.payment_method === 'card' ? 'credit_card' : 'payments'}
                                                </span>
                                            </div>
                                            <div>
                                                <p className="text-gray-500 text-[8px] uppercase font-black tracking-widest">Método do Cliente</p>
                                                <p className="text-white font-black text-xs uppercase">
                                                    {ride.payment_method === 'pix' ? 'PIX Coleta' :
                                                        ride.payment_method === 'card' ? 'Cartão' : 'Dinheiro / Direto'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-gray-500 text-[8px] uppercase font-black tracking-widest">Valor à Cobrar</p>
                                            <p className="text-whatsapp-green font-black text-lg">R$ {ride.estimated_price?.toFixed(2)}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (window.confirm("Confirma que recebeu o pagamento de R$ " + ride.estimated_price?.toFixed(2) + "?")) {
                                                onStatusUpdate('finished');
                                            }
                                        }}
                                        className="w-full py-4 bg-whatsapp-green text-black font-black rounded-2xl shadow-xl active:scale-95 text-[11px] uppercase tracking-widest"
                                    >
                                        Confirmar Recebimento e Finalizar
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => onStatusUpdate('waiting_payment')}
                                    className="py-3.5 bg-green-600 text-white font-black rounded-2xl transition shadow-lg active:scale-95 text-[11px] uppercase tracking-widest flex items-center justify-center gap-2"
                                >
                                    <span className="material-icons text-base">flag</span>
                                    Finalizar Corrida
                                </button>
                            )
                        )}
                    </div>

                    {/* Botão para Finalizar Corrida (Apenas para Central - Bypass) */}
                    {ride.client_id === '11111111-1111-1111-1111-111111111111' && (
                        <button
                            onClick={() => {
                                if (window.confirm("Deseja finalizar esta corrida e ficar disponível?")) {
                                    onStatusUpdate('finished');
                                }
                            }}
                            className="w-full py-4 bg-red-600 shadow-red-600/20 text-white font-black rounded-2xl transition active:scale-95 text-[11px] uppercase tracking-widest flex items-center justify-center gap-2"
                        >
                            <span className="material-icons text-base">check_circle</span>
                            Finalizar (Central)
                        </button>
                    )}
                </div>
            </div>

            {/* MESSAGE POPUP OVERLAY */}
            {showMessagePopup && (
                <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-end justify-center animate-fade-in">
                    <div className="w-full max-w-lg bg-[#1f2c34] rounded-t-[40px] max-h-[85vh] flex flex-col animate-slide-up border-t border-white/10 shadow-2xl">
                        {/* Popup Header */}
                        <div className="flex items-center justify-between p-6 border-b border-white/5">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-whatsapp-green">
                                    <img
                                        src={ride.client?.avatar_url || `https://ui-avatars.com/api/?name=${ride.client?.username}`}
                                        className="w-full h-full object-cover"
                                        alt="Cliente"
                                    />
                                </div>
                                <div>
                                    <h4 className="text-white font-bold text-lg">{ride.client?.username}</h4>
                                    <p className="text-whatsapp-green text-xs font-black uppercase tracking-widest">Chat com Cliente</p>
                                </div>
                            </div>
                            <button
                                onClick={handleClosePopup}
                                className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-gray-400"
                            >
                                <span className="material-icons">close</span>
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-[300px]">
                            {popupMessages.length === 0 ? (
                                <div className="text-center text-gray-500 py-20 flex flex-col items-center">
                                    <div className="bg-white/5 w-20 h-20 rounded-full flex items-center justify-center mb-4">
                                        <span className="material-icons text-5xl opacity-20">chat_bubble</span>
                                    </div>
                                    <p className="font-bold">Nenhuma mensagem ainda</p>
                                </div>
                            ) : (
                                popupMessages.map(msg => (
                                    <div
                                        key={msg.id}
                                        className={`flex ${msg.sender_id === driver.id ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div
                                            className={`max-w-[85%] px-5 py-3 rounded-[24px] shadow-lg ${msg.sender_id === driver.id
                                                ? 'bg-whatsapp-green text-black rounded-tr-sm'
                                                : 'bg-white/10 text-white rounded-tl-sm'
                                                }`}
                                        >
                                            <p className="text-[15px] font-medium leading-relaxed">{msg.content}</p>
                                            <p className={`text-[9px] mt-2 font-black uppercase opacity-50 text-right`}>
                                                {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Quick Reply Input */}
                        <div className="p-6 border-t border-white/5 bg-[#1f2c34]">
                            <div className="flex gap-3 mb-4 overflow-x-auto pb-2 -mx-2 px-2 no-scrollbar">
                                {['Já estou chegando!', 'Aguarde um momento', 'Pode descer', 'Obrigado!'].map(quick => (
                                    <button
                                        key={quick}
                                        onClick={() => {
                                            setReplyText(quick);
                                            setTimeout(handleSendReply, 100);
                                        }}
                                        className="bg-white/5 text-white/70 px-4 py-2 rounded-xl text-xs whitespace-nowrap border border-white/5 hover:bg-white/10 transition active:scale-95"
                                    >
                                        {quick}
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
                                    placeholder="Escreva sua mensagem..."
                                    className="flex-1 bg-white/5 text-white px-5 py-4 rounded-2xl outline-none focus:ring-2 ring-whatsapp-green/40 border border-white/5"
                                />
                                <button
                                    onClick={handleSendReply}
                                    disabled={!replyText.trim()}
                                    className="bg-whatsapp-green text-black w-14 h-14 rounded-2xl flex items-center justify-center transition active:scale-90 disabled:opacity-50 shadow-xl shadow-whatsapp-green/20"
                                >
                                    <span className="material-icons">send</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
