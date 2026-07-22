-- =================================================================================
-- CHEGOJÁ - SETUP COMPLETO DO NOVO BANCO DE DADOS (SCHEMA: chegoja)
-- Execute TODO este script no SQL Editor do Supabase (https://supabase.appbr.pro)
-- Script idempotente: pode ser executado mais de uma vez sem causar erros.
--
-- IMPORTANTE (self-hosted): o schema 'chegoja' precisa estar exposto na API REST.
-- Verifique a variável PGRST_DB_SCHEMAS (ou "Exposed schemas" nas configurações
-- da API) e inclua: public, storage, chegoja
-- =================================================================================

-- 0. SCHEMA E EXTENSÕES
CREATE SCHEMA IF NOT EXISTS chegoja;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =================================================================================
-- 1. PROFILES (Clientes, Motoristas e Admin)
-- =================================================================================
CREATE TABLE IF NOT EXISTS chegoja.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL,
    phone TEXT,
    password TEXT,
    role TEXT NOT NULL CHECK (role IN ('client', 'driver', 'admin')),
    status TEXT NOT NULL DEFAULT 'offline',
    is_approved BOOLEAN DEFAULT TRUE,
    avatar_url TEXT,
    vehicle_model TEXT,
    vehicle_plate TEXT,
    vehicle_color TEXT,
    vehicle_type TEXT CHECK (vehicle_type IN ('car', 'motorcycle')),
    lat FLOAT,
    lng FLOAT,
    subscription_expires_at TIMESTAMPTZ,
    unread_count INTEGER DEFAULT 0,
    is_pip_active BOOLEAN DEFAULT FALSE,
    -- Carteira / Financeiro
    wallet_coins INTEGER DEFAULT 0,
    financial_balance FLOAT DEFAULT 0.0,
    pix_key TEXT,
    -- Dados pessoais / contato
    whatsapp TEXT,
    email TEXT,
    cpf TEXT,
    address_street TEXT,
    address_number TEXT,
    address_neighborhood TEXT,
    address_city TEXT,
    address_zip TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Garantia de colunas (caso a tabela já exista sem elas)
ALTER TABLE chegoja.profiles ADD COLUMN IF NOT EXISTS unread_count INTEGER DEFAULT 0;
ALTER TABLE chegoja.profiles ADD COLUMN IF NOT EXISTS is_pip_active BOOLEAN DEFAULT FALSE;
ALTER TABLE chegoja.profiles ADD COLUMN IF NOT EXISTS wallet_coins INTEGER DEFAULT 0;
ALTER TABLE chegoja.profiles ADD COLUMN IF NOT EXISTS financial_balance FLOAT DEFAULT 0.0;
ALTER TABLE chegoja.profiles ADD COLUMN IF NOT EXISTS pix_key TEXT;
ALTER TABLE chegoja.profiles ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE chegoja.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE chegoja.profiles ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE chegoja.profiles ADD COLUMN IF NOT EXISTS address_street TEXT;
ALTER TABLE chegoja.profiles ADD COLUMN IF NOT EXISTS address_number TEXT;
ALTER TABLE chegoja.profiles ADD COLUMN IF NOT EXISTS address_neighborhood TEXT;
ALTER TABLE chegoja.profiles ADD COLUMN IF NOT EXISTS address_city TEXT;
ALTER TABLE chegoja.profiles ADD COLUMN IF NOT EXISTS address_zip TEXT;

-- Admin padrão — a senha é hasheada com bcrypt ANTES de salvar.
-- ⚠️ ALTERE a senha imediatamente após o primeiro login no painel admin.
--    Para trocar via SQL: UPDATE chegoja.profiles SET password = chegoja.hash_password('SUA_NOVA_SENHA') WHERE username = 'Holanda2025';
INSERT INTO chegoja.profiles (username, password, role, is_approved, avatar_url, status)
SELECT 'Holanda2025', extensions.crypt('TempAdmin2026!', extensions.gen_salt('bf')), 'admin', true, 'https://ui-avatars.com/api/?name=Admin&background=0D8ABC&color=fff', 'available'
WHERE NOT EXISTS (SELECT 1 FROM chegoja.profiles WHERE role = 'admin');

-- Perfil da Central de Despacho (ID fixo usado pelo código)
INSERT INTO chegoja.profiles (id, username, role, is_approved, avatar_url, status)
VALUES ('11111111-1111-1111-1111-111111111111', 'Central de Atendimento', 'client', true, 'https://cdn-icons-png.flaticon.com/512/3233/3233966.png', 'offline')
ON CONFLICT (id) DO NOTHING;

-- =================================================================================
-- 2. MESSAGES (Chat)
-- =================================================================================
CREATE TABLE IF NOT EXISTS chegoja.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL,
    receiver_id UUID NOT NULL,
    content TEXT,
    media_url TEXT,
    media_type TEXT CHECK (media_type IN ('text', 'audio', 'image', 'location')),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_sender ON chegoja.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON chegoja.messages (receiver_id);

-- =================================================================================
-- 3. APP_SETTINGS (Taxímetro, Preço Dinâmico, Customização, Efí Bank)
-- =================================================================================
CREATE TABLE IF NOT EXISTS chegoja.app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    car_base_price FLOAT DEFAULT 5.0,
    car_price_km FLOAT DEFAULT 2.5,
    car_price_min FLOAT DEFAULT 0.5,
    car_start_distance_limit FLOAT DEFAULT 0.0,
    moto_base_price FLOAT DEFAULT 3.5,
    moto_price_km FLOAT DEFAULT 1.8,
    moto_price_min FLOAT DEFAULT 0.3,
    moto_start_distance_limit FLOAT DEFAULT 0.0,
    -- Preço dinâmico (Noite)
    night_start_time TEXT DEFAULT '19:00',
    night_end_time TEXT DEFAULT '23:59',
    night_car_base_price FLOAT DEFAULT 7.0,
    night_car_price_km FLOAT DEFAULT 3.5,
    night_car_price_min FLOAT DEFAULT 0.7,
    night_moto_base_price FLOAT DEFAULT 5.0,
    night_moto_price_km FLOAT DEFAULT 2.5,
    night_moto_price_min FLOAT DEFAULT 0.5,
    -- Preço dinâmico (Madrugada)
    dawn_start_time TEXT DEFAULT '00:00',
    dawn_end_time TEXT DEFAULT '05:00',
    dawn_car_base_price FLOAT DEFAULT 10.0,
    dawn_car_price_km FLOAT DEFAULT 4.5,
    dawn_car_price_min FLOAT DEFAULT 1.0,
    dawn_moto_base_price FLOAT DEFAULT 7.5,
    dawn_moto_price_km FLOAT DEFAULT 3.5,
    dawn_moto_price_min FLOAT DEFAULT 0.8,
    -- Customização
    marquee_text TEXT DEFAULT 'ENTRE E CONCORRA A PRÊMIOS TODA SEMANA! - PRÊMIOS CHEGOJÁ',
    car_icon_url TEXT,
    moto_icon_url TEXT,
    car_name TEXT DEFAULT 'Mob Comum',
    car_description TEXT DEFAULT 'Viagem econômica',
    moto_name TEXT DEFAULT 'Mob Moto',
    moto_description TEXT DEFAULT 'Rapidez e agilidade',
    coin_value_brl FLOAT DEFAULT 1.0,
    -- Efí Bank (Gerencianet)
    efi_client_id TEXT,
    efi_client_secret TEXT,
    efi_pix_key TEXT,
    efi_account_code TEXT,
    -- WhatsApp oficial
    official_whatsapp TEXT
);

-- Garantia de colunas (migração segura)
ALTER TABLE chegoja.app_settings ADD COLUMN IF NOT EXISTS coin_value_brl FLOAT DEFAULT 1.0;
ALTER TABLE chegoja.app_settings ADD COLUMN IF NOT EXISTS car_name TEXT DEFAULT 'Mob Comum';
ALTER TABLE chegoja.app_settings ADD COLUMN IF NOT EXISTS car_description TEXT DEFAULT 'Viagem econômica';
ALTER TABLE chegoja.app_settings ADD COLUMN IF NOT EXISTS moto_name TEXT DEFAULT 'Mob Moto';
ALTER TABLE chegoja.app_settings ADD COLUMN IF NOT EXISTS moto_description TEXT DEFAULT 'Rapidez e agilidade';
ALTER TABLE chegoja.app_settings ADD COLUMN IF NOT EXISTS car_icon_url TEXT;
ALTER TABLE chegoja.app_settings ADD COLUMN IF NOT EXISTS moto_icon_url TEXT;
ALTER TABLE chegoja.app_settings ADD COLUMN IF NOT EXISTS efi_client_id TEXT;
ALTER TABLE chegoja.app_settings ADD COLUMN IF NOT EXISTS efi_client_secret TEXT;
ALTER TABLE chegoja.app_settings ADD COLUMN IF NOT EXISTS efi_pix_key TEXT;
ALTER TABLE chegoja.app_settings ADD COLUMN IF NOT EXISTS efi_account_code TEXT;
ALTER TABLE chegoja.app_settings ADD COLUMN IF NOT EXISTS official_whatsapp TEXT;
ALTER TABLE chegoja.app_settings ADD COLUMN IF NOT EXISTS waha_api_key TEXT;

-- Linha padrão
INSERT INTO chegoja.app_settings (car_base_price)
SELECT 5.0 WHERE NOT EXISTS (SELECT 1 FROM chegoja.app_settings);

-- =================================================================================
-- 4. BINGO
-- =================================================================================
CREATE TABLE IF NOT EXISTS chegoja.bingo_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prize_image TEXT,
    prize_description TEXT,
    youtube_link TEXT,
    drawn_numbers JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE
);
INSERT INTO chegoja.bingo_settings (prize_image)
SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM chegoja.bingo_settings);

CREATE TABLE IF NOT EXISTS chegoja.bingo_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES chegoja.profiles(id) ON DELETE CASCADE,
    numbers JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id)
);

-- =================================================================================
-- 5. BROADCASTS (Notificações em massa no app)
-- =================================================================================
CREATE TABLE IF NOT EXISTS chegoja.broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_role TEXT NOT NULL CHECK (target_role IN ('client', 'driver', 'all')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =================================================================================
-- 6. PLANOS E ASSINATURAS (Motoristas)
-- =================================================================================
CREATE TABLE IF NOT EXISTS chegoja.driver_plans (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    price NUMERIC NOT NULL,
    days INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
INSERT INTO chegoja.driver_plans (id, title, description, price, days)
VALUES
('plan_24h',  'Plano Diário',    'Acesso total por 24 horas',  10.00, 1),
('plan_7d',   'Plano Semanal',   'Acesso total por 7 dias',    33.00, 7),
('plan_15d',  'Plano Quinzenal', 'Acesso total por 15 dias',   66.00, 15),
('plan_30d',  'Plano Mensal',    'Acesso total por 30 dias',  100.00, 30)
ON CONFLICT (id) DO NOTHING;

-- Remove planos antigos com IDs inconsistentes (se existirem)
DELETE FROM chegoja.driver_plans WHERE id IN ('daily', 'weekly', 'monthly');

CREATE TABLE IF NOT EXISTS chegoja.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES chegoja.profiles(id) ON DELETE CASCADE,
    plan_id TEXT REFERENCES chegoja.driver_plans(id),
    start_date DATE DEFAULT CURRENT_DATE,
    next_billing_date DATE,
    active BOOLEAN DEFAULT TRUE,
    payment_id TEXT,
    payment_status TEXT,
    payment_method TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =================================================================================
-- 7. RIDES (Corridas)
-- =================================================================================
CREATE TABLE IF NOT EXISTS chegoja.rides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES chegoja.profiles(id),
    driver_id UUID REFERENCES chegoja.profiles(id),
    status TEXT NOT NULL DEFAULT 'searching',
    vehicle_type TEXT NOT NULL DEFAULT 'car' CHECK (vehicle_type IN ('car', 'motorcycle')),
    -- Origem
    origin_lat FLOAT NOT NULL,
    origin_lng FLOAT NOT NULL,
    origin_address TEXT,
    -- Destino
    destination_lat FLOAT,
    destination_lng FLOAT,
    destination_address TEXT,
    -- Valores e distâncias
    estimated_price FLOAT,
    estimated_time FLOAT,  -- o app envia minutos com decimais (durationMins do Mapbox)
    distance_km FLOAT,
    duration_min FLOAT,
    final_price NUMERIC,
    -- Cupons
    coupon_id UUID,
    discount_amount FLOAT DEFAULT 0,
    -- Pagamento
    payment_method TEXT,                       -- 'pix', 'card', 'cash', 'coins'
    payment_status TEXT DEFAULT 'pending',     -- 'pending', 'completed', 'failed'
    coins_used INTEGER DEFAULT 0,
    -- Dispatch (Central)
    is_broadcast BOOLEAN DEFAULT FALSE,
    ignored_drivers TEXT[],
    last_driver_offered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Constraint de status (com 'waiting_payment') — recria de forma segura
DO $$
DECLARE
    v_conname TEXT;
BEGIN
    SELECT conname INTO v_conname
    FROM pg_constraint
    WHERE conrelid = 'chegoja.rides'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%';

    IF v_conname IS NOT NULL THEN
        EXECUTE 'ALTER TABLE chegoja.rides DROP CONSTRAINT ' || quote_ident(v_conname);
    END IF;

    ALTER TABLE chegoja.rides
    ADD CONSTRAINT rides_status_check
    CHECK (status IN ('searching', 'accepted', 'en_route', 'arrived', 'started', 'waiting_payment', 'finished', 'cancelled'));
END $$;

-- Migração: estimated_time era INTEGER em bancos antigos
ALTER TABLE chegoja.rides ALTER COLUMN estimated_time TYPE FLOAT;

-- Avaliação de corridas (1-5 estrelas dadas pelo cliente)
ALTER TABLE chegoja.rides ADD COLUMN IF NOT EXISTS rating INTEGER CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE chegoja.rides ADD COLUMN IF NOT EXISTS rating_comment TEXT;

CREATE INDEX IF NOT EXISTS idx_rides_client ON chegoja.rides (client_id);
CREATE INDEX IF NOT EXISTS idx_rides_driver ON chegoja.rides (driver_id);
CREATE INDEX IF NOT EXISTS idx_rides_status ON chegoja.rides (status);

-- =================================================================================
-- 8. COUPONS (Cupons de desconto por imagem)
-- =================================================================================
CREATE TABLE IF NOT EXISTS chegoja.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_url TEXT,
    discount_value NUMERIC NOT NULL DEFAULT 1.0,
    vehicle_type TEXT CHECK (vehicle_type IN ('car', 'motorcycle', 'all')),
    total_quantity INTEGER NOT NULL DEFAULT 100,
    used_quantity INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =================================================================================
-- 9. BANNERS (Carrossel da Dashboard)
-- =================================================================================
CREATE TABLE IF NOT EXISTS chegoja.banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_url TEXT NOT NULL,
    link_url TEXT,
    active BOOLEAN DEFAULT TRUE,
    "order" INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_banners_order ON chegoja.banners ("order");
CREATE INDEX IF NOT EXISTS idx_banners_active ON chegoja.banners (active);

-- =================================================================================
-- 10. ADDRESS_HISTORY (Memória de endereços / Auto-complete)
-- Suporta os dois usos do app: RPCs globais (ClientDashboard) e histórico por
-- usuário (saveRideAddressHistory em supabaseClient.ts).
-- =================================================================================
CREATE TABLE IF NOT EXISTS chegoja.address_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    address TEXT NOT NULL,
    lat FLOAT,
    lng FLOAT,
    usage_count INTEGER DEFAULT 1,
    used_count INTEGER DEFAULT 1,
    last_used_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    UNIQUE(address)
);

CREATE OR REPLACE FUNCTION chegoja.search_address_history(p_query TEXT)
RETURNS TABLE (
    address TEXT,
    lat FLOAT,
    lng FLOAT,
    p_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT ah.address, ah.lat, ah.lng, ah.usage_count
    FROM chegoja.address_history ah
    WHERE ah.address ILIKE '%' || p_query || '%'
    ORDER BY ah.usage_count DESC, ah.last_used_at DESC
    LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION chegoja.register_address_usage(
    p_address TEXT,
    p_lat FLOAT,
    p_lng FLOAT
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO chegoja.address_history (address, lat, lng, usage_count, last_used_at)
    VALUES (p_address, p_lat, p_lng, 1, timezone('utc'::text, now()))
    ON CONFLICT (address)
    DO UPDATE SET
        usage_count = chegoja.address_history.usage_count + 1,
        last_used_at = timezone('utc'::text, now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================================
-- 11. LOJA E CARTEIRA (Store, Orders, Wallet) — estrutura conforme o app (types.ts)
-- =================================================================================
CREATE TABLE IF NOT EXISTS chegoja.store_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price_brl FLOAT NOT NULL DEFAULT 0,
    price_coins INTEGER NOT NULL DEFAULT 0,
    image_url TEXT,
    stock INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS chegoja.store_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES chegoja.profiles(id),
    product_id UUID REFERENCES chegoja.store_products(id),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'delivered')),
    payment_method TEXT,            -- 'coins', 'pix', 'card'
    amount_coins INTEGER DEFAULT 0,
    amount_money FLOAT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    delivered_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS chegoja.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES chegoja.profiles(id),
    type TEXT NOT NULL,             -- 'earning', 'purchase', 'discount', 'payout', 'bonus'
    amount_coins INTEGER DEFAULT 0,
    amount_money FLOAT DEFAULT 0,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON chegoja.wallet_transactions (user_id);

-- =================================================================================
-- 12. PAYMENT_REQUESTS (Solicitações de Saque)
-- =================================================================================
CREATE TABLE IF NOT EXISTS chegoja.payment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES chegoja.profiles(id),
    amount_money NUMERIC(10,2) DEFAULT 0,
    amount_coins INTEGER DEFAULT 0,
    pix_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'paid', 'rejected'
    type TEXT NOT NULL,                      -- 'driver_payout', 'client_withdrawal'
    admin_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_requests_user ON chegoja.payment_requests (user_id);

-- =================================================================================
-- 13. PUSH NOTIFICATIONS (Tokens FCM + Histórico)
-- =================================================================================
CREATE TABLE IF NOT EXISTS chegoja.push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES chegoja.profiles(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform TEXT DEFAULT 'android',  -- 'android', 'ios', 'web'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON chegoja.push_tokens (user_id);

CREATE TABLE IF NOT EXISTS chegoja.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    target_type TEXT NOT NULL,  -- 'all', 'drivers', 'clients', 'user'
    target_user_id UUID REFERENCES chegoja.profiles(id) ON DELETE SET NULL,
    sent_by UUID REFERENCES chegoja.profiles(id),
    sent_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION chegoja.get_push_tokens(target_type TEXT, target_user_id UUID DEFAULT NULL)
RETURNS TABLE(token TEXT, user_id UUID, username TEXT) AS $$
BEGIN
    IF target_type = 'all' THEN
        RETURN QUERY
        SELECT pt.token, pt.user_id, p.username
        FROM chegoja.push_tokens pt
        JOIN chegoja.profiles p ON pt.user_id = p.id;
    ELSIF target_type = 'drivers' THEN
        RETURN QUERY
        SELECT pt.token, pt.user_id, p.username
        FROM chegoja.push_tokens pt
        JOIN chegoja.profiles p ON pt.user_id = p.id
        WHERE p.role = 'driver';
    ELSIF target_type = 'clients' THEN
        RETURN QUERY
        SELECT pt.token, pt.user_id, p.username
        FROM chegoja.push_tokens pt
        JOIN chegoja.profiles p ON pt.user_id = p.id
        WHERE p.role = 'client';
    ELSIF target_type = 'user' AND target_user_id IS NOT NULL THEN
        RETURN QUERY
        SELECT pt.token, pt.user_id, p.username
        FROM chegoja.push_tokens pt
        JOIN chegoja.profiles p ON pt.user_id = p.id
        WHERE pt.user_id = target_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================================
-- 14. APP_SECRETS (Chaves de API — acessível só via service_role)
-- =================================================================================
CREATE TABLE IF NOT EXISTS chegoja.app_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_name TEXT UNIQUE NOT NULL,
    key_value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =================================================================================
-- 15. FUNÇÕES RPC USADAS PELO APP
-- =================================================================================

-- Incrementa (ou decrementa) moedas do usuário e retorna o novo saldo
CREATE OR REPLACE FUNCTION chegoja.increment_coins(user_id_param UUID, amount_param INTEGER)
RETURNS INTEGER AS $$
DECLARE
    new_balance INTEGER;
BEGIN
    UPDATE chegoja.profiles
    SET wallet_coins = COALESCE(wallet_coins, 0) + amount_param
    WHERE id = user_id_param
    RETURNING wallet_coins INTO new_balance;

    RETURN new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Incrementa o uso de um cupom de forma atômica
CREATE OR REPLACE FUNCTION chegoja.increment_coupon_usage(coupon_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    rows_updated INTEGER;
BEGIN
    UPDATE chegoja.coupons
    SET used_quantity = used_quantity + 1
    WHERE id = coupon_id
      AND used_quantity < total_quantity
      AND is_active = TRUE;

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    RETURN rows_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Pagamento de corrida com moedas (transferência Cliente -> Motorista, atômica)
CREATE OR REPLACE FUNCTION chegoja.pay_ride_with_coins(
    p_ride_id UUID,
    p_client_id UUID,
    p_driver_id UUID,
    p_coins_amount NUMERIC,
    p_discount_value NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client_coins NUMERIC;
BEGIN
    -- 1. Verificar saldo do cliente
    SELECT wallet_coins INTO v_client_coins FROM chegoja.profiles WHERE id = p_client_id;

    IF v_client_coins IS NULL OR v_client_coins < p_coins_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Saldo insuficiente de moedas.');
    END IF;

    -- 2. Debitar do cliente
    UPDATE chegoja.profiles
    SET wallet_coins = wallet_coins - p_coins_amount
    WHERE id = p_client_id;

    -- 3. Creditar ao motorista
    UPDATE chegoja.profiles
    SET wallet_coins = COALESCE(wallet_coins, 0) + p_coins_amount
    WHERE id = p_driver_id;

    -- 4. Atualizar a corrida
    UPDATE chegoja.rides
    SET
        coins_used = COALESCE(coins_used, 0) + p_coins_amount,
        estimated_price = GREATEST(0, estimated_price - p_discount_value),
        payment_method = CASE
                            WHEN (estimated_price - p_discount_value) <= 0.01 THEN 'coins'
                            ELSE payment_method
                         END,
        status = CASE
                   WHEN (estimated_price - p_discount_value) <= 0.01 THEN 'finished'
                   ELSE status
                 END,
        payment_status = CASE
                           WHEN (estimated_price - p_discount_value) <= 0.01 THEN 'completed'
                           ELSE payment_status
                         END,
        final_price = CASE
                        WHEN (estimated_price - p_discount_value) <= 0.01 THEN 0
                        ELSE (estimated_price - p_discount_value)
                      END
    WHERE id = p_ride_id;

    RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Saque atômico (valida saldo + debita + cria request + loga, numa transação)
CREATE OR REPLACE FUNCTION chegoja.request_payout(
    p_user_id UUID,
    p_type TEXT,
    p_amount_money NUMERIC,
    p_amount_coins INTEGER,
    p_pix_key TEXT
) RETURNS JSONB AS $$
DECLARE
    v_coins INTEGER;
    v_balance NUMERIC;
BEGIN
    IF p_type = 'client_withdrawal' THEN
        SELECT COALESCE(wallet_coins,0) INTO v_coins FROM chegoja.profiles WHERE id = p_user_id FOR UPDATE;
        IF v_coins IS NULL THEN RETURN jsonb_build_object('success',false,'message','Usuario nao encontrado'); END IF;
        IF v_coins < p_amount_coins THEN RETURN jsonb_build_object('success',false,'message','Saldo de moedas insuficiente'); END IF;
        UPDATE chegoja.profiles SET wallet_coins = wallet_coins - p_amount_coins WHERE id = p_user_id;
    ELSE
        SELECT COALESCE(financial_balance,0) INTO v_balance FROM chegoja.profiles WHERE id = p_user_id FOR UPDATE;
        IF v_balance IS NULL THEN RETURN jsonb_build_object('success',false,'message','Usuario nao encontrado'); END IF;
        IF v_balance < p_amount_money THEN RETURN jsonb_build_object('success',false,'message','Saldo financeiro insuficiente'); END IF;
        UPDATE chegoja.profiles SET financial_balance = financial_balance - p_amount_money WHERE id = p_user_id;
    END IF;

    INSERT INTO chegoja.payment_requests (user_id, type, amount_money, amount_coins, pix_key, status)
    VALUES (p_user_id, p_type, p_amount_money, p_amount_coins, p_pix_key, 'pending');

    INSERT INTO chegoja.wallet_transactions (user_id, type, amount_coins, amount_money, description)
    VALUES (p_user_id, 'payout',
            CASE WHEN p_type='client_withdrawal' THEN -p_amount_coins ELSE 0 END,
            CASE WHEN p_type='driver_payout' THEN -p_amount_money ELSE 0 END,
            'Solicitacao de Saque');

    RETURN jsonb_build_object('success',true,'message','Solicitacao enviada com sucesso!');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success',false,'message','Erro: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ganhos do dia do motorista (corridas finalizadas hoje, fuso de São Paulo)
CREATE OR REPLACE FUNCTION chegoja.driver_today_earnings(p_driver_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_total NUMERIC;
BEGIN
    SELECT COALESCE(SUM(COALESCE(final_price, estimated_price, 0)), 0)
    INTO v_total
    FROM chegoja.rides
    WHERE driver_id = p_driver_id
      AND status = 'finished'
      AND updated_at >= date_trunc('day', timezone('America/Sao_Paulo', now()));
    RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Média de avaliação do motorista
CREATE OR REPLACE FUNCTION chegoja.driver_avg_rating(p_driver_id UUID)
RETURNS NUMERIC AS $$
    SELECT COALESCE(ROUND(AVG(rating)::numeric, 1), 5.0)
    FROM chegoja.rides
    WHERE driver_id = p_driver_id AND rating IS NOT NULL;
$$ LANGUAGE sql SECURITY DEFINER;

-- Login com bcrypt + migração automática de senhas legadas em texto puro.
-- A senha NUNCA é devolvida ao cliente.
CREATE OR REPLACE FUNCTION chegoja.login_with_password(p_username TEXT, p_password TEXT, p_role TEXT)
RETURNS SETOF chegoja.profiles AS $$
DECLARE
    v_profile chegoja.profiles%ROWTYPE;
    v_ok BOOLEAN := FALSE;
BEGIN
    SELECT * INTO v_profile FROM chegoja.profiles
    WHERE LOWER(username) = LOWER(p_username) AND role = p_role LIMIT 1;

    IF v_profile.id IS NULL THEN RETURN; END IF;

    IF v_profile.password LIKE '$2%' THEN
        v_ok := v_profile.password = extensions.crypt(p_password, v_profile.password);
    ELSE
        IF v_profile.password = p_password THEN
            UPDATE chegoja.profiles SET password = extensions.crypt(p_password, extensions.gen_salt('bf'))
            WHERE id = v_profile.id;
            v_ok := TRUE;
        END IF;
    END IF;

    IF v_ok THEN
        v_profile.password := NULL;
        RETURN NEXT v_profile;
    END IF;
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Hash bcrypt para cadastro/troca de senha
CREATE OR REPLACE FUNCTION chegoja.hash_password(p_password TEXT)
RETURNS TEXT AS $$
    SELECT extensions.crypt(p_password, extensions.gen_salt('bf'));
$$ LANGUAGE sql SECURITY DEFINER;

-- =================================================================================
-- 16. SEGURANÇA (RLS + POLÍTICAS)
-- O app usa login próprio (tabela profiles) com a anon key — sem Supabase Auth.
-- Por isso as políticas são permissivas (padrão do projeto), exceto app_secrets.
-- =================================================================================
ALTER TABLE chegoja.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE chegoja.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chegoja.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chegoja.bingo_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chegoja.bingo_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE chegoja.broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chegoja.driver_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE chegoja.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chegoja.rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE chegoja.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE chegoja.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE chegoja.address_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE chegoja.store_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE chegoja.store_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE chegoja.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chegoja.payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE chegoja.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE chegoja.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE chegoja.app_secrets ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY[
        'profiles', 'messages', 'app_settings', 'bingo_settings', 'bingo_cards',
        'broadcasts', 'driver_plans', 'subscriptions', 'rides', 'coupons',
        'banners', 'address_history', 'store_products', 'store_orders',
        'wallet_transactions', 'payment_requests', 'push_tokens', 'notifications'
    ];
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Acesso total" ON chegoja.%I', t);
        EXECUTE format('CREATE POLICY "Acesso total" ON chegoja.%I FOR ALL USING (true) WITH CHECK (true)', t);
    END LOOP;
END $$;
-- app_secrets: SEM política permissiva — só o service_role (Edge Functions) acessa.

-- =================================================================================
-- 17. GRANTS (necessários porque o schema 'chegoja' não é o public)
-- =================================================================================
GRANT USAGE ON SCHEMA chegoja TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA chegoja TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA chegoja TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA chegoja TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA chegoja GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA chegoja GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA chegoja GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- =================================================================================
-- 18. REALTIME (Publication supabase_realtime)
-- =================================================================================
DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY[
        'profiles', 'messages', 'app_settings', 'bingo_settings', 'bingo_cards',
        'broadcasts', 'driver_plans', 'subscriptions', 'rides', 'coupons',
        'banners', 'store_products', 'store_orders', 'wallet_transactions',
        'payment_requests'
    ];
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    FOREACH t IN ARRAY tables
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'chegoja'
              AND tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE chegoja.%I', t);
        END IF;
    END LOOP;
END $$;

-- =================================================================================
-- 19. STORAGE (Bucket 'chat-media' para fotos, áudios, banners e produtos)
-- =================================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'chat-media',
    'chat-media',
    true,
    5242880,  -- 5MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'audio/webm', 'audio/mp4', 'audio/ogg']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'audio/webm', 'audio/mp4', 'audio/ogg'];

DROP POLICY IF EXISTS "Public Upload" ON storage.objects;
DROP POLICY IF EXISTS "Public Read" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete" ON storage.objects;
DROP POLICY IF EXISTS "Public Update" ON storage.objects;

CREATE POLICY "Public Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-media');
CREATE POLICY "Public Read"   ON storage.objects FOR SELECT USING (bucket_id = 'chat-media');
CREATE POLICY "Public Delete" ON storage.objects FOR DELETE USING (bucket_id = 'chat-media');
CREATE POLICY "Public Update" ON storage.objects FOR UPDATE USING (bucket_id = 'chat-media');

-- =================================================================================
-- 20. VERIFICAÇÃO FINAL
-- =================================================================================
SELECT table_name,
       (SELECT COUNT(*) FROM information_schema.columns c
        WHERE c.table_schema = 'chegoja' AND c.table_name = t.table_name) AS colunas
FROM information_schema.tables t
WHERE table_schema = 'chegoja'
ORDER BY table_name;
