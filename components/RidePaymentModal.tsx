
import React, { useState, useEffect, useRef } from 'react';
import { Ride, UserProfile, PayerFormData, CardFormData, PixPaymentResponse } from '../types';
import { supabase } from '../services/supabaseClient';
import { createRidePixPayment, createRideCardPayment, getPaymentStatus, checkPaymentByReference } from '../services/paymentService';

interface RidePaymentModalProps {
    ride: Ride;
    currentUser: UserProfile;
    onPaymentComplete: () => void;
}

// Máximo de tentativas de polling (5s × 60 = 5 minutos)
const MAX_POLL_ATTEMPTS = 60;

export const RidePaymentModal: React.FC<RidePaymentModalProps> = ({ ride, currentUser, onPaymentComplete }) => {
    const [useCoins, setUseCoins] = useState(false);
    const [selectedMethod, setSelectedMethod] = useState<'cash' | 'pix' | 'card'>('cash');
    const [step, setStep] = useState<'select' | 'data' | 'pay' | 'cash_waiting' | 'success'>('select');
    const [loading, setLoading] = useState(false);
    const [pollAttempts, setPollAttempts] = useState(0);
    const [pollExpired, setPollExpired] = useState(false);

    const [formData, setFormData] = useState<PayerFormData>({
        firstName: currentUser.username.split(' ')[0] || '',
        lastName: currentUser.username.split(' ').slice(1).join(' ') || 'Cliente',
        email: currentUser.email || '',
        cpf: currentUser.cpf || '',
        phone: currentUser.phone || '',
        birthDate: '',
        zipCode: currentUser.address_zip || '',
        street: currentUser.address_street || '',
        number: currentUser.address_number || '',
        neighborhood: currentUser.address_neighborhood || '',
        city: currentUser.address_city || '',
        state: ''
    });

    const [cardData, setCardData] = useState<CardFormData>({
        cardNumber: '',
        cardholderName: '',
        expirationMonth: '',
        expirationYear: '',
        securityCode: '',
        installments: 1
    });

    const [pixData, setPixData] = useState<PixPaymentResponse | null>(null);
    const pollingInterval = useRef<any>(null);
    const pollAttemptsRef = useRef(0);

    const ridePrice = ride.estimated_price || 0;
    const userCoins = currentUser.wallet_coins || 0;
    const COIN_VALUE = 0.50;

    const maxDiscount = useCoins ? Math.min(ridePrice, userCoins * COIN_VALUE) : 0;
    const coinsToUse = useCoins ? Math.ceil(maxDiscount / COIN_VALUE) : 0;
    const finalCashAmount = Math.max(0, ridePrice - maxDiscount);
    const isFullCoinPayment = finalCashAmount === 0;

    useEffect(() => {
        return () => {
            if (pollingInterval.current) clearInterval(pollingInterval.current);
        };
    }, []);

    const startPolling = (pixId?: string | number, reference?: string) => {
        if (pollingInterval.current) clearInterval(pollingInterval.current);
        pollAttemptsRef.current = 0;
        setPollAttempts(0);
        setPollExpired(false);

        pollingInterval.current = setInterval(async () => {
            pollAttemptsRef.current += 1;
            setPollAttempts(pollAttemptsRef.current);

            // Timeout após MAX_POLL_ATTEMPTS tentativas
            if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
                clearInterval(pollingInterval.current);
                setPollExpired(true);
                return;
            }

            let status = 'unknown';
            if (pixId) {
                status = await getPaymentStatus(pixId);
            } else if (reference) {
                const res = await checkPaymentByReference(reference);
                if (res.found) status = res.status;
            }

            if (status === 'approved' || status === 'paid') {
                clearInterval(pollingInterval.current);
                finalizePaymentProcess(true, false);
            }
        }, 5000);
    };

    const handleInitialConfirm = () => {
        if (isFullCoinPayment) {
            finalizePaymentProcess(true, true);
        } else if (selectedMethod === 'cash') {
            handleCashPayment();
        } else {
            setStep('data');
        }
    };

    // Pagamento em dinheiro: registra intenção e exibe tela de espera
    const handleCashPayment = async () => {
        setLoading(true);
        try {
            if (coinsToUse > 0) {
                await supabase.rpc('pay_ride_with_coins', {
                    p_ride_id: ride.id,
                    p_client_id: currentUser.id,
                    p_driver_id: ride.driver_id,
                    p_coins_amount: coinsToUse,
                    p_discount_value: maxDiscount
                });
            }
            await supabase.from('rides').update({
                payment_method: 'cash',
                final_price: finalCashAmount
            }).eq('id', ride.id);
            setStep('cash_waiting');
        } catch (e: any) {
            console.error(e);
            alert("Erro ao registrar pagamento: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleGeneratePayment = async () => {
        if (!formData.cpf || !formData.email) {
            alert("CPF e E-mail são obrigatórios para emitir o pagamento.");
            return;
        }

        setLoading(true);
        try {
            const rideForPayment = { ...ride, final_price: finalCashAmount };

            if (selectedMethod === 'pix') {
                const res = await createRidePixPayment(rideForPayment, currentUser, formData);
                if (res) {
                    setPixData(res);
                    setStep('pay');
                    if (res.id) startPolling(res.id);
                }
            } else if (selectedMethod === 'card') {
                if (!cardData.cardNumber || !cardData.securityCode) {
                    alert("Preencha os dados do cartão.");
                    setLoading(false);
                    return;
                }
                const res = await createRideCardPayment(rideForPayment, currentUser, formData, cardData);
                if (res.success) {
                    // Cartão aprovado: deduzir moedas agora e finalizar
                    finalizePaymentProcess(true, false);
                } else {
                    alert("Erro no cartão: " + res.message);
                }
            }
        } catch (e: any) {
            console.error(e);
            alert("Erro ao processar: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    // isDigitalPayment=true → PIX/Cartão/Moedas confirmados; deductCoinsFirst=true → pagamento puro em moedas
    const finalizePaymentProcess = async (isDigitalPayment: boolean, deductCoinsFirst: boolean) => {
        if (pollingInterval.current) clearInterval(pollingInterval.current);
        setLoading(true);

        try {
            // Deduzir moedas apenas após confirmação do pagamento digital
            if (deductCoinsFirst && coinsToUse > 0) {
                await supabase.rpc('pay_ride_with_coins', {
                    p_ride_id: ride.id,
                    p_client_id: currentUser.id,
                    p_driver_id: ride.driver_id,
                    p_coins_amount: coinsToUse,
                    p_discount_value: maxDiscount
                });
            } else if (isDigitalPayment && coinsToUse > 0 && selectedMethod !== 'cash') {
                // Pagamento híbrido (moedas + PIX/cartão): deduzir moedas agora que o digital confirmou
                await supabase.rpc('pay_ride_with_coins', {
                    p_ride_id: ride.id,
                    p_client_id: currentUser.id,
                    p_driver_id: ride.driver_id,
                    p_coins_amount: coinsToUse,
                    p_discount_value: maxDiscount
                });
            }

            await supabase.from('rides').update({
                payment_method: isFullCoinPayment ? 'coins' : selectedMethod,
                payment_status: 'completed',
                status: 'finished',
                final_price: finalCashAmount
            }).eq('id', ride.id);

            setStep('success');
            setTimeout(onPaymentComplete, 3000);
        } catch (e) {
            console.error(e);
            alert("Erro ao finalizar pagamento.");
        } finally {
            setLoading(false);
        }
    };

    const renderSelectStep = () => (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-end">
                <span className="text-gray-400 text-sm uppercase font-bold">Total a Pagar</span>
                <span className="text-3xl font-black text-white">R$ {ridePrice.toFixed(2)}</span>
            </div>

            {userCoins > 0 && (
                <div
                    className={`p-4 rounded-xl border transition cursor-pointer ${useCoins ? 'bg-yellow-500/20 border-yellow-500' : 'bg-white/5 border-white/5'}`}
                    onClick={() => setUseCoins(!useCoins)}
                >
                    <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${useCoins ? 'bg-yellow-500 border-yellow-500' : 'border-gray-500'}`}>
                            {useCoins && <span className="material-icons text-xs text-black font-bold">check</span>}
                        </div>
                        <div className="flex-1 text-left">
                            <p className={`font-bold text-sm ${useCoins ? 'text-yellow-400' : 'text-gray-300'}`}>Usar Saldo em Moedas</p>
                            <p className="text-xs text-gray-500">Saldo: {userCoins} (Desc. máx: R$ {(userCoins * COIN_VALUE).toFixed(2)})</p>
                        </div>
                        {useCoins && <span className="font-bold text-yellow-400">- R$ {maxDiscount.toFixed(2)}</span>}
                    </div>
                </div>
            )}

            {!isFullCoinPayment && (
                <div className="grid grid-cols-3 gap-3">
                    {(['cash', 'pix', 'card'] as const).map(method => (
                        <button
                            key={method}
                            onClick={() => setSelectedMethod(method)}
                            className={`py-3 rounded-xl border flex flex-col items-center gap-1 transition ${
                                selectedMethod === method
                                    ? method === 'cash' ? 'bg-green-600 border-green-600 text-white'
                                        : method === 'pix' ? 'bg-whatsapp-green border-whatsapp-green text-white'
                                        : 'bg-blue-600 border-blue-600 text-white'
                                    : 'bg-white/5 border-white/5 text-gray-400'
                            }`}
                        >
                            <span className="material-icons text-xl">
                                {method === 'cash' ? 'attach_money' : method === 'pix' ? 'pix' : 'credit_card'}
                            </span>
                            <span className="text-[10px] font-bold uppercase">
                                {method === 'cash' ? 'Dinheiro' : method === 'pix' ? 'PIX' : 'Cartão'}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            <div className="pt-4 border-t border-white/10">
                <div className="flex justify-between items-center mb-4">
                    <span className="text-gray-400 text-sm">A Pagar Agora</span>
                    <span className="text-2xl font-black text-whatsapp-green">R$ {finalCashAmount.toFixed(2)}</span>
                </div>
                <button
                    onClick={handleInitialConfirm}
                    disabled={loading}
                    className="w-full py-4 bg-whatsapp-green hover:bg-emerald-500 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest transition active:scale-95 disabled:opacity-50"
                >
                    {loading ? (
                        <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"></span>
                    ) : isFullCoinPayment || selectedMethod === 'cash'
                        ? 'Confirmar Pagamento'
                        : `Pagar com ${selectedMethod === 'pix' ? 'PIX' : 'Cartão'}`}
                </button>
            </div>
        </div>
    );

    const renderDataStep = () => (
        <div className="p-6 space-y-4 animate-slide-up bg-white text-black h-full overflow-y-auto">
            <div className="flex items-center gap-2 mb-2">
                <button onClick={() => setStep('select')} className="p-2 -ml-2"><span className="material-icons">arrow_back</span></button>
                <h3 className="font-bold text-lg">Dados de Pagamento</h3>
            </div>

            <input
                placeholder="CPF (Apenas números)"
                value={formData.cpf}
                onChange={e => setFormData({ ...formData, cpf: e.target.value })}
                className="w-full bg-gray-100 p-3 rounded-xl outline-none"
                inputMode="numeric"
                maxLength={14}
            />
            <input
                placeholder="E-mail"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-gray-100 p-3 rounded-xl outline-none"
                type="email"
            />

            {selectedMethod === 'card' && (
                <>
                    <input
                        placeholder="Número do Cartão"
                        value={cardData.cardNumber}
                        onChange={e => setCardData({ ...cardData, cardNumber: e.target.value })}
                        className="w-full bg-gray-100 p-3 rounded-xl outline-none"
                        inputMode="numeric"
                        maxLength={19}
                    />
                    <div className="grid grid-cols-2 gap-3">
                        <input placeholder="Mês (MM)" maxLength={2} inputMode="numeric" value={cardData.expirationMonth} onChange={e => setCardData({ ...cardData, expirationMonth: e.target.value })} className="bg-gray-100 p-3 rounded-xl outline-none" />
                        <input placeholder="Ano (AA)" maxLength={2} inputMode="numeric" value={cardData.expirationYear} onChange={e => setCardData({ ...cardData, expirationYear: e.target.value })} className="bg-gray-100 p-3 rounded-xl outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <input placeholder="CVV" maxLength={4} inputMode="numeric" value={cardData.securityCode} onChange={e => setCardData({ ...cardData, securityCode: e.target.value })} className="bg-gray-100 p-3 rounded-xl outline-none" />
                        <input placeholder="Nome no Cartão" value={cardData.cardholderName} onChange={e => setCardData({ ...cardData, cardholderName: e.target.value })} className="bg-gray-100 p-3 rounded-xl outline-none" />
                    </div>
                </>
            )}

            <button
                onClick={handleGeneratePayment}
                disabled={loading}
                className="w-full py-4 bg-black text-white font-black rounded-2xl shadow-xl uppercase tracking-widest mt-4 disabled:opacity-50"
            >
                {loading ? (
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"></span>
                ) : selectedMethod === 'pix' ? 'Gerar PIX' : 'Pagar Agora'}
            </button>
        </div>
    );

    const renderPayStep = () => (
        <div className="p-6 space-y-6 text-center animate-slide-up bg-white text-black h-full">
            {selectedMethod === 'pix' && pixData ? (
                <>
                    <h3 className="font-bold text-lg mb-4">Pague com PIX</h3>
                    <div className="bg-gray-100 p-4 rounded-xl inline-block">
                        <img
                            src={pixData.point_of_interaction.transaction_data.qr_code_base64.startsWith('data:')
                                ? pixData.point_of_interaction.transaction_data.qr_code_base64
                                : `data:image/png;base64,${pixData.point_of_interaction.transaction_data.qr_code_base64}`}
                            className="w-48 h-48 mx-auto"
                            alt="QR Code PIX"
                        />
                    </div>
                    <div className="flex gap-2 bg-gray-50 p-2 rounded-xl border border-gray-200 mt-4">
                        <input readOnly value={pixData.point_of_interaction.transaction_data.qr_code} className="flex-1 bg-transparent px-2 text-xs truncate" />
                        <button
                            onClick={() => navigator.clipboard.writeText(pixData.point_of_interaction.transaction_data.qr_code)}
                            className="text-blue-600 font-bold text-xs uppercase"
                        >
                            Copiar
                        </button>
                    </div>

                    {pollExpired ? (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-4">
                            <p className="text-red-700 font-bold text-sm">Tempo de espera esgotado.</p>
                            <p className="text-red-500 text-xs mt-1">Se já pagou, toque em "Verificar Pagamento" abaixo.</p>
                            <button
                                onClick={async () => {
                                    if (!pixData.id) return;
                                    setLoading(true);
                                    const status = await getPaymentStatus(pixData.id);
                                    setLoading(false);
                                    if (status === 'approved' || status === 'paid') {
                                        finalizePaymentProcess(true, false);
                                    } else {
                                        alert("Pagamento ainda não identificado. Aguarde ou entre em contato com o suporte.");
                                    }
                                }}
                                disabled={loading}
                                className="mt-3 w-full py-3 bg-red-600 text-white font-black rounded-xl text-sm uppercase disabled:opacity-50"
                            >
                                {loading ? 'Verificando...' : 'Verificar Pagamento'}
                            </button>
                        </div>
                    ) : (
                        <div className="text-xs text-gray-500 mt-4 flex items-center justify-center gap-2">
                            <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin inline-block"></span>
                            Aguardando confirmação... ({MAX_POLL_ATTEMPTS - pollAttempts} tentativas restantes)
                        </div>
                    )}
                </>
            ) : (
                <div className="flex items-center justify-center h-full">
                    <span className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin inline-block"></span>
                </div>
            )}
        </div>
    );

    const renderCashWaitingStep = () => (
        <div className="p-8 text-center h-full flex flex-col items-center justify-center gap-6">
            <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center">
                <span className="material-icons text-5xl text-green-400">payments</span>
            </div>
            <div>
                <h3 className="text-xl font-black text-white uppercase">Pagamento em Dinheiro</h3>
                <p className="text-gray-400 text-sm mt-2 max-w-xs">
                    Realize o pagamento de <span className="text-white font-bold">R$ {finalCashAmount.toFixed(2)}</span> diretamente ao motorista.
                </p>
                <p className="text-gray-500 text-xs mt-3">A corrida será finalizada quando o motorista confirmar o recebimento.</p>
            </div>
            <div className="w-full p-4 bg-white/5 rounded-2xl border border-white/10 space-y-2">
                <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Valor total</span>
                    <span className="text-white font-bold">R$ {ridePrice.toFixed(2)}</span>
                </div>
                {coinsToUse > 0 && (
                    <div className="flex justify-between text-sm">
                        <span className="text-yellow-400">Desconto moedas</span>
                        <span className="text-yellow-400 font-bold">- R$ {maxDiscount.toFixed(2)}</span>
                    </div>
                )}
                <div className="flex justify-between text-sm border-t border-white/10 pt-2">
                    <span className="text-gray-300 font-bold">A pagar em dinheiro</span>
                    <span className="text-green-400 font-black">R$ {finalCashAmount.toFixed(2)}</span>
                </div>
            </div>
        </div>
    );

    const renderSuccessStep = () => (
        <div className="p-10 text-center animate-scale-up bg-green-500 h-full flex flex-col items-center justify-center text-white">
            <span className="material-icons text-6xl mb-4">check_circle</span>
            <h2 className="text-2xl font-black uppercase">Pagamento Confirmado!</h2>
            <p className="text-sm mt-2">Sua corrida foi finalizada com sucesso.</p>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
            <div className="w-full h-[90vh] sm:h-auto sm:max-w-md bg-whatsapp-panel border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl animate-slide-up flex flex-col">
                {(step === 'select' || step === 'cash_waiting') && (
                    <div className="p-6 text-center border-b border-white/5 bg-whatsapp-green/10">
                        <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                            {step === 'cash_waiting' ? 'Aguardando Motorista' : 'Pagamento'}
                        </h2>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto">
                    {step === 'select' && renderSelectStep()}
                    {step === 'data' && renderDataStep()}
                    {step === 'pay' && renderPayStep()}
                    {step === 'cash_waiting' && renderCashWaitingStep()}
                    {step === 'success' && renderSuccessStep()}
                </div>
            </div>
        </div>
    );
};
