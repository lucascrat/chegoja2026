
import React, { useEffect, useState } from 'react';
import { Ride } from '../types';

interface DriverRideCallProps {
    ride: Ride;
    onAccept: () => void;
    onReject: () => void;
}

export const DriverRideCall: React.FC<DriverRideCallProps> = ({ ride, onAccept, onReject }) => {
    const [timeLeft, setTimeLeft] = useState(10);

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    onReject();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-sm bg-whatsapp-panel border border-white/10 rounded-[40px] shadow-2xl overflow-hidden animate-zoom-in">
                <div className="p-8 text-center">
                    <div className="relative w-28 h-28 mx-auto mb-8">
                        <div className="absolute inset-0 bg-whatsapp-green rounded-full animate-ping opacity-20"></div>
                        <div className="absolute inset-4 bg-whatsapp-green rounded-full flex items-center justify-center shadow-2xl">
                            <span className="material-icons text-4xl text-white">
                                {ride.vehicle_type === 'motorcycle' ? 'two_wheeler' : 'directions_car'}
                            </span>
                        </div>
                        <svg className="absolute inset-0 w-full h-full -rotate-90">
                            <circle
                                cx="56" cy="56" r="52"
                                fill="none"
                                stroke="rgba(255,255,255,0.1)"
                                strokeWidth="4"
                            />
                            <circle
                                cx="56" cy="56" r="52"
                                fill="none"
                                stroke="#00a884"
                                strokeWidth="4"
                                strokeDasharray="327"
                                strokeDashoffset={327 - (327 * timeLeft / 10)}
                                className="transition-all duration-1000"
                            />
                        </svg>
                    </div>

                    <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter">Nova Corrida</h2>
                    <p className="text-whatsapp-green font-bold text-lg mb-8">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ride.estimated_price || 0)}
                    </p>

                    <div className="space-y-4 mb-10 text-left">
                        <div className="flex gap-4">
                            <div className="flex flex-col items-center gap-1 mt-1">
                                <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                                <div className="w-0.5 flex-1 bg-white/10"></div>
                                <div className="w-2.5 h-2.5 rounded-md bg-red-500"></div>
                            </div>
                            <div className="flex-1 space-y-4">
                                <div>
                                    <p className="text-[10px] text-gray-500 uppercase font-black">Partida</p>
                                    <p className="text-sm text-gray-200 font-medium line-clamp-1">{ride.origin_address || 'Localização do Cliente'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-gray-500 uppercase font-black">Destino</p>
                                    <p className="text-sm text-gray-200 font-medium line-clamp-1">{ride.destination_address || 'Definir no embarque'}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={onReject}
                            className="flex-1 py-5 bg-white/5 hover:bg-white/10 text-white font-bold rounded-3xl transition active:scale-95 border border-white/10 uppercase tracking-widest text-xs"
                        >
                            Ignorar
                        </button>
                        <button
                            onClick={onAccept}
                            className="flex-[2] py-5 bg-whatsapp-green hover:bg-emerald-500 text-white font-black rounded-3xl transition active:scale-95 shadow-xl shadow-whatsapp-green/40 uppercase tracking-widest text-sm"
                        >
                            Aceitar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
