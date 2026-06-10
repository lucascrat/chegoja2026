import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { supabase, fetchDriverPlans } from './supabaseClient';
import { UserProfile, PayerFormData, PixPaymentResponse, StoreProduct, CardFormData } from '../types';

// --- EFI HELPERS ---

export const initializeEfi = async () => {
    // Efí Bank não exige inicialização de SDK para Pix via API Transparente
    return true;
};

// ── Utilitário: detecta bandeira pelo número do cartão ──────────────────────
const detectCardBrand = (cardNumber: string): string => {
    const n = cardNumber.replace(/\s/g, '');
    if (/^4/.test(n)) return 'visa';
    if (/^5[1-5]/.test(n)) return 'mastercard';
    if (/^3[47]/.test(n)) return 'amex';
    if (/^6(?:011|5[0-9]{2})/.test(n)) return 'discover';
    if (/^(606282|3841)/.test(n)) return 'hipercard';
    if (/^(4011|4389|4514|50(41|67|90)|6277|6362)/.test(n)) return 'elo';
    if (/^3(?:0[0-5]|[68][0-9])/.test(n)) return 'diners';
    return 'visa';
};

// ── Utilitário: tokeniza cartão via SDK EfiPay com timeout ──────────────────
const tokenizeCard = async (cardData: CardFormData, cpf: string): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error("A Efí Pay não respondeu a tempo. Verifique sua conexão."));
        }, 30000);

        try {
            const EfiPay = (window as any).EfiPay;
            if (!EfiPay) {
                clearTimeout(timeout);
                reject(new Error("Módulo Efí Pay não inicializado. Verifique se o domínio está autorizado."));
                return;
            }

            const cleanCardNumber = cardData.cardNumber.replace(/\s/g, '');
            const expMonth = cardData.expirationMonth.toString().padStart(2, '0');
            const rawYear = cardData.expirationYear.toString();
            const expYear = rawYear.length === 2 ? `20${rawYear}` : rawYear;

            EfiPay.CreditCard
                .setAccount("21e60cb9dc98eb4f5d0377903434dc3d")
                .setEnvironment("production")
                .setCreditCardData({
                    brand: detectCardBrand(cleanCardNumber),
                    number: cleanCardNumber,
                    cvv: cardData.securityCode,
                    expirationMonth: expMonth,
                    expirationYear: expYear,
                    holderName: cardData.cardholderName.trim().toUpperCase(),
                    holderDocument: String(cpf).replace(/\D/g, ''),
                    reuse: false
                })
                .getPaymentToken()
                .then((result: any) => {
                    clearTimeout(timeout);
                    resolve(result.payment_token);
                })
                .catch((err: any) => {
                    clearTimeout(timeout);
                    reject(new Error(err.error_description || err.message || "Erro ao validar cartão na Efí"));
                });
        } catch (err: any) {
            clearTimeout(timeout);
            reject(new Error(err.error_description || err.message || "Erro inesperado no SDK Efí"));
        }
    });
};

// ── Utilitário: POST para VPS (web + nativo) ────────────────────────────────
const vpsPost = async (body: object): Promise<any> => {
    if (IS_NATIVE) {
        const response = await CapacitorHttp.post({
            url: FINAL_VPS_URL,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            data: body
        });
        if (response.status !== 200) {
            const info = typeof response.data === 'string' ? response.data.substring(0, 150) : JSON.stringify(response.data);
            throw new Error(`VPS respondeu ${response.status}: ${info}`);
        }
        return response.data;
    } else {
        const response = await fetch(FINAL_VPS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text.substring(0, 150)}`);
        }
        return response.json();
    }
};

// --- MAIN EXPORTED METHODS ---

const IS_NATIVE = Capacitor.isNativePlatform();
const VPS_IP_URL = 'http://168.231.98.99:3000/payment-manager';
const FINAL_VPS_URL = IS_NATIVE
    ? VPS_IP_URL
    : '/api/payment-vps/payment-manager';

console.log(`[PaymentService] Plataforma: ${IS_NATIVE ? 'Nativa' : 'Web'}, Usando URL: ${FINAL_VPS_URL}`);

export const createPixPayment = async (
    planId: string,
    user: UserProfile,
    payerData: PayerFormData
): Promise<PixPaymentResponse | null> => {
    try {
        if (!payerData.cpf || payerData.cpf.length < 11) {
            throw new Error("CPF é obrigatório e deve ser válido.");
        }

        console.log(`[Payment] Gerando Pix via ${FINAL_VPS_URL}...`);

        const responseData = await vpsPost({
            action: 'create',
            planId,
            user,
            payerData: { ...payerData, cpf: payerData.cpf.replace(/\D/g, '') }
        });

        if (responseData && responseData.error) throw new Error(responseData.error);
        return responseData as PixPaymentResponse;
    } catch (error: any) {
        console.error("Erro ao gerar Pix:", error);
        if (IS_NATIVE) alert("Erro Pix Mobile (C-HTTP): " + error.message);
        throw error;
    }
};

export const createProductPixPayment = async (
    product: StoreProduct,
    user: UserProfile,
    payerData: PayerFormData
): Promise<PixPaymentResponse | null> => {
    try {
        if (!payerData.cpf || payerData.cpf.length < 11) {
            throw new Error("CPF é obrigatório e deve ser válido.");
        }

        console.log(`[Payment] Gerando Pix Produto via ${FINAL_VPS_URL}...`);

        const responseData = await vpsPost({
            action: 'create',
            user,
            payerData: { ...payerData, product, cpf: payerData.cpf.replace(/\D/g, '') }
        });

        if (responseData && responseData.error) throw new Error(responseData.error);
        return responseData as PixPaymentResponse;
    } catch (e: any) {
        console.error("Erro no createProductPixPayment:", e);
        if (IS_NATIVE) alert("Erro Pix Produto Mobile (C-HTTP): " + e.message);
        throw e;
    }
};

export const createProductCardPayment = async (
    product: StoreProduct,
    user: UserProfile,
    payerData: PayerFormData,
    cardData: CardFormData
): Promise<{ success: boolean; status: string; message: string; paymentId?: string }> => {
    try {
        console.log("[Payment] Iniciando pagamento de produto com cartão Efí...");
        const paymentToken = await tokenizeCard(cardData, payerData.cpf);
        console.log(`[Payment] Enviando Token ao Servidor via ${FINAL_VPS_URL}...`);

        const responseData = await vpsPost({
            action: 'card',
            paymentToken,
            installments: cardData.installments || 1,
            payerData: {
                ...payerData,
                product,
                reference: `prod-${user.id}-${product.id}-${Date.now()}`,
                cpf: payerData.cpf.replace(/\D/g, ''),
                email: (payerData.email || "financeiro@chegoja.com.br").trim().toLowerCase(),
                phone: payerData.phone || user.phone || "11999999999",
                birthDate: payerData.birthDate || "1990-01-01"
            }
        });

        if (responseData && responseData.error) throw new Error(responseData.error);
        return responseData;
    } catch (e: any) {
        console.error("Erro no pagamento de cartão:", e);
        return { success: false, status: 'error', message: e.message };
    }
};

export const createSubscriptionCardPayment = async (
    planId: string,
    user: UserProfile,
    payerData: PayerFormData,
    cardData: CardFormData
): Promise<{ success: boolean; status: string; message: string; paymentId?: string }> => {
    try {
        console.log("[Payment] Iniciando pagamento de assinatura com cartão Efí...");
        const paymentToken = await tokenizeCard(cardData, payerData.cpf);
        console.log(`[Subscription] Enviando Token via ${FINAL_VPS_URL}...`);

        const responseData = await vpsPost({
            action: 'card',
            planId,
            paymentToken,
            installments: 1,
            payerData: {
                ...payerData,
                reference: `plan-${user.id}-${planId}-${Date.now()}`,
                cpf: payerData.cpf.replace(/\D/g, ''),
                email: (payerData.email || "financeiro@chegoja.com.br").trim().toLowerCase(),
                phone: payerData.phone || user.phone || "11999999999",
                birthDate: payerData.birthDate || "1990-01-01"
            }
        });

        console.log("[Payment] Resposta Assinatura:", responseData);
        return responseData;
    } catch (e: any) {
        console.error("Erro no pagamento de assinatura:", e);
        if (IS_NATIVE) alert("Erro Assinatura Mobile (C-HTTP): " + e.message);
        return { success: false, status: 'error', message: e.message };
    }
};

export const checkPaymentByReference = async (reference: string): Promise<{ found: boolean; status: string }> => {
    try {
        const responseData = await vpsPost({ action: 'check_reference', reference });
        return { found: responseData.success, status: responseData.status };
    } catch (e) {
        console.error("Erro ao verificar por referência:", e);
        return { found: false, status: 'error' };
    }
};

export const getPaymentStatus = async (paymentId: string | number): Promise<string> => {
    try {
        const responseData = await vpsPost({ action: 'check', paymentId: String(paymentId) });
        return responseData.status || 'unknown';
    } catch (error) {
        console.error("Erro ao verificar status:", error);
        return 'unknown';
    }
};

export const activatePlan = async (userId: string, planId: string): Promise<boolean> => {
    const plans = await fetchDriverPlans();
    const plan = plans.find(p => p.id === planId);
    if (!plan) return false;

    const now = new Date();

    const { data: user, error: fetchError } = await supabase.from('profiles').select('subscription_expires_at').eq('id', userId).single();

    if (fetchError) {
        if (fetchError.code === '42703') {
            console.error("CRITICAL DB ERROR: Column 'subscription_expires_at' missing.", fetchError);
            alert("Erro Crítico: O banco de dados está desatualizado (Falta coluna de assinatura). Por favor, peça ao administrador para rodar o SQL de atualização.");
        } else {
            console.error("Erro ao buscar perfil para ativar plano:", JSON.stringify(fetchError));
        }
        return false;
    }

    let baseDate = now;
    if (user && user.subscription_expires_at) {
        const currentExpire = new Date(user.subscription_expires_at);
        // Se a assinatura ainda é válida, soma dias ao final dela
        if (currentExpire > now) {
            baseDate = currentExpire;
        }
    }

    const newExpire = new Date(baseDate);
    newExpire.setDate(newExpire.getDate() + plan.days);

    const { error } = await supabase
        .from('profiles')
        .update({ subscription_expires_at: newExpire.toISOString() })
        .eq('id', userId);

    if (error) {
        console.error("Erro ao ativar plano (Update):", error.message || JSON.stringify(error));
        alert("Erro ao salvar assinatura. Tente novamente.");
        return false;
    }

    // --- REGISTRAR TRANSAÇÃO FINANCEIRA PARA O ADMIN ---
    await supabase.from('wallet_transactions').insert({
        user_id: userId,
        type: 'purchase',
        amount_money: plan.price,
        description: `Assinatura: Plano ${plan.title}`
    });

    return true;
};

export const checkSubscriptionStatus = (expiresAt?: string): { isValid: boolean, daysLeft: number } => {
    if (!expiresAt) return { isValid: false, daysLeft: 0 };

    const now = new Date();
    const expire = new Date(expiresAt);

    const diffTime = expire.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return {
        isValid: diffTime > 0,
        daysLeft: diffDays > 0 ? diffDays : 0
    };
};

// --- RIDE PAYMENT SERVICES ---

export const createRidePixPayment = async (
    ride: { id: string; estimated_price?: number; final_price?: number },
    user: UserProfile,
    payerData: PayerFormData
): Promise<PixPaymentResponse | null> => {
    try {
        if (!payerData.cpf || payerData.cpf.length < 11) {
            throw new Error("CPF é obrigatório e deve ser válido.");
        }

        // Create a 'fake' product to reuse the VPS logic which expects a product object
        const finalAmount = ride.final_price || ride.estimated_price || 0;
        const rideProduct: StoreProduct = {
            id: ride.id, // Use ride ID as product ID
            name: `Corrida ChegoJá`,
            description: `Pagamento da corrida ${ride.id}`,
            price_brl: finalAmount,
            price_coins: 0,
            image_url: '',
            stock: 1,
            active: true,
            created_at: new Date().toISOString()
        };

        console.log(`[Payment] Gerando Pix Corrida via ${FINAL_VPS_URL} para R$ ${finalAmount}...`);

        const responseData = await vpsPost({
            action: 'create',
            user,
            payerData: {
                ...payerData,
                product: rideProduct,
                reference: `ride-${ride.id}-${Date.now()}`,
                cpf: payerData.cpf.replace(/\D/g, '')
            }
        });

        if (responseData && responseData.error) throw new Error(responseData.error);
        return responseData as PixPaymentResponse;
    } catch (e: any) {
        console.error("Erro no createRidePixPayment:", e);
        if (IS_NATIVE) alert("Erro Pix Corrida Mobile: " + e.message);
        throw e;
    }
};

export const createRideCardPayment = async (
    ride: { id: string; estimated_price?: number; final_price?: number },
    user: UserProfile,
    payerData: PayerFormData,
    cardData: CardFormData
): Promise<{ success: boolean; status: string; message: string; paymentId?: string }> => {
    try {
        console.log("[Payment] Iniciando pagamento de corrida com cartão Efí...");
        const paymentToken = await tokenizeCard(cardData, payerData.cpf);

        const finalAmount = ride.final_price || ride.estimated_price || 0;
        const rideProduct: StoreProduct = {
            id: ride.id,
            name: `Corrida ChegoJá`,
            description: `Pagamento da corrida ${ride.id}`,
            price_brl: finalAmount,
            price_coins: 0,
            image_url: '',
            stock: 1,
            active: true,
            created_at: new Date().toISOString()
        };

        const responseData = await vpsPost({
            action: 'card',
            paymentToken,
            installments: cardData.installments || 1,
            payerData: {
                ...payerData,
                product: rideProduct,
                reference: `ride-${user.id}-${ride.id}-${Date.now()}`,
                cpf: payerData.cpf.replace(/\D/g, ''),
                email: (payerData.email || "financeiro@chegoja.com.br").trim().toLowerCase(),
                phone: payerData.phone || user.phone || "11999999999",
                birthDate: payerData.birthDate || "1990-01-01"
            }
        });

        if (responseData && responseData.error) throw new Error(responseData.error);
        return responseData;
    } catch (e: any) {
        console.error("Erro no pagamento de corrida com cartão:", e);
        return { success: false, status: 'error', message: e.message };
    }
};
