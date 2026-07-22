-- ============================================================
-- CHEGOJÁ — MIGRAÇÃO DE SEGURANÇA E CORREÇÕES
-- ============================================================
-- Execute este script DEPOIS de SETUP_NOVO_BANCO_COMPLETO.sql
-- no SQL Editor do Supabase (https://supabase.appbr.pro)
--
-- O que este script faz:
-- 1. RPC atômica para aceite de corrida (evita race condition)
-- 2. RPC atômica para rotação de motorista (dispatch)
-- 3. Restringe acesso a app_secrets (apenas service_role)
-- 4. Remove planos antigos com IDs inconsistentes
-- ============================================================

-- ============================================================
-- 1. RPC ATÔMICA: ACEITAR CORRIDA
-- ============================================================
-- Garante que apenas UM motorista consiga aceitar a corrida.
-- Se dois motoristas tentarem aceitar ao mesmo tempo, apenas o
-- primeiro terá sucesso (o segundo recebe FALSE).
-- ============================================================
CREATE OR REPLACE FUNCTION chegoja.accept_ride_atomic(
    p_ride_id UUID,
    p_driver_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rows_updated INTEGER;
BEGIN
    -- UPDATE condicional: só atualiza se status = 'searching'
    -- Isto é atômico a nível de linha (Postgres garante o lock)
    UPDATE chegoja.rides
    SET
        driver_id = p_driver_id,
        status = 'en_route',
        updated_at = NOW()
    WHERE id = p_ride_id
      AND status = 'searching';

    GET DIAGNOSTICS rows_updated = ROW_COUNT;

    -- Se atualizou 1 linha, sucesso. Se 0, alguém já aceitou.
    RETURN rows_updated > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION chegoja.accept_ride_atomic(UUID, UUID) TO anon, authenticated, service_role;


-- ============================================================
-- 2. RPC ATÔMICA: ROTACIONAR MOTORISTA (DISPATCH)
-- ============================================================
-- Substitui a função findAndAssignNextDriver do frontend.
-- Tudo numa transação: adiciona motorista atual aos ignorados,
-- busca o próximo disponível e atribui — sem race conditions.
-- ============================================================
CREATE OR REPLACE FUNCTION chegoja.rotate_driver_atomic(
    p_ride_id UUID,
    p_current_driver_id UUID
)
RETURNS TABLE(assigned_driver_id UUID, success BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ride chegoja.rides%ROWTYPE;
    v_ignored TEXT[];
    v_next_driver_id UUID;
BEGIN
    -- 1. Lock da corrida (SELECT FOR UPDATE evita concorrência)
    SELECT * INTO v_ride
    FROM chegoja.rides
    WHERE id = p_ride_id
    FOR UPDATE;

    IF v_ride.id IS NULL THEN
        RETURN QUERY SELECT NULL::UUID, FALSE;
        RETURN;
    END IF;

    -- 2. Adiciona motorista atual à lista de ignorados
    v_ignored := COALESCE(v_ride.ignored_drivers, ARRAY[]::TEXT[]);
    IF NOT (p_current_driver_id = ANY(v_ignored)) THEN
        v_ignored := array_append(v_ignored, p_current_driver_id);
    END IF;

    -- 3. Busca próximo motorista disponível (mesmo tipo de veículo)
    SELECT p.id INTO v_next_driver_id
    FROM chegoja.profiles p
    WHERE p.role = 'driver'
      AND p.status = 'available'
      AND p.is_approved = true
      AND p.vehicle_type = v_ride.vehicle_type
      AND NOT (p.id::text = ANY(v_ignored))
    LIMIT 1;

    -- 4. Atribui ou volta para 'searching' (broadcast)
    IF v_next_driver_id IS NOT NULL THEN
        UPDATE chegoja.rides
        SET
            driver_id = v_next_driver_id,
            status = 'searching',
            ignored_drivers = v_ignored,
            last_driver_offered_at = NOW(),
            updated_at = NOW()
        WHERE id = p_ride_id;
    ELSE
        -- Sem mais motoristas: volta para broadcast
        UPDATE chegoja.rides
        SET
            driver_id = NULL,
            status = 'searching',
            ignored_drivers = v_ignored,
            updated_at = NOW()
        WHERE id = p_ride_id;
    END IF;

    RETURN QUERY SELECT v_next_driver_id, TRUE;
    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION chegoja.rotate_driver_atomic(UUID, UUID) TO anon, authenticated, service_role;


-- ============================================================
-- 3. RESTRINGIR app_secrets — apenas service_role
-- ============================================================
-- A tabela app_secrets contém chaves de API (Firebase, etc).
-- Removemos a política permissiva e criamos uma que só permite
-- acesso via service_role (Edge Functions).
-- ============================================================
DROP POLICY IF EXISTS "Acesso total" ON chegoja.app_secrets;
CREATE POLICY "app_secrets service_role only"
    ON chegoja.app_secrets
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');


-- ============================================================
-- 4. REMOVER PLANOS ANTIGOS (IDs inconsistentes)
-- ============================================================
-- Os planos antigos usavam IDs 'daily', 'weekly', 'monthly'.
-- Agora usamos 'plan_24h', 'plan_7d', 'plan_15d', 'plan_30d'
-- para bater com o código TypeScript e a Edge Function.
-- ============================================================
DELETE FROM chegoja.driver_plans WHERE id IN ('daily', 'weekly', 'monthly');

INSERT INTO chegoja.driver_plans (id, title, description, price, days)
VALUES
('plan_24h',  'Plano Diário',    'Acesso total por 24 horas',  10.00, 1),
('plan_7d',   'Plano Semanal',   'Acesso total por 7 dias',    33.00, 7),
('plan_15d',  'Plano Quinzenal', 'Acesso total por 15 dias',   66.00, 15),
('plan_30d',  'Plano Mensal',    'Acesso total por 30 dias',  100.00, 30)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    price = EXCLUDED.price,
    days = EXCLUDED.days;


-- ============================================================
-- 5. VERIFICAÇÃO
-- ============================================================
SELECT 'RPCs criadas:' as info;
SELECT proname as rpc_name
FROM pg_proc
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'chegoja')
  AND proname IN ('accept_ride_atomic', 'rotate_driver_atomic');

SELECT 'Planos atuais:' as info;
SELECT id, title, price, days FROM chegoja.driver_plans ORDER BY price;
