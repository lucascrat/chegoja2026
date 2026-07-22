-- ============================================================
-- MELHORIAS DE CORRIDAS (rodar DEPOIS do SETUP_RAIO_CHAMADAS.sql)
-- 1. Célula de grade da corrida (filtro do Realtime no servidor)
-- 2. Devolução de cupom (corrida cancelada/expirada)
-- 3. Expiração automática de corridas 'searching' (10 min)
-- Executar no SQL Editor do Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1. CÉLULA DE GRADE (~11 km) — multi-cidades no Realtime
--    O app do motorista assina só as células ao redor dele;
--    eventos de corridas de outras cidades nem saem do servidor.
--    Cálculo DEVE bater com o do app: floor(lat*10) || '_' || floor(lng*10)
-- ------------------------------------------------------------
ALTER TABLE chegoja.rides ADD COLUMN IF NOT EXISTS origin_cell TEXT;

CREATE OR REPLACE FUNCTION chegoja.set_ride_origin_cell()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.origin_lat IS NOT NULL AND NEW.origin_lng IS NOT NULL THEN
        NEW.origin_cell := floor(NEW.origin_lat * 10)::int || '_' || floor(NEW.origin_lng * 10)::int;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ride_origin_cell ON chegoja.rides;
CREATE TRIGGER trg_ride_origin_cell
    BEFORE INSERT OR UPDATE OF origin_lat, origin_lng ON chegoja.rides
    FOR EACH ROW EXECUTE FUNCTION chegoja.set_ride_origin_cell();

-- Backfill das corridas existentes
UPDATE chegoja.rides
SET origin_cell = floor(origin_lat * 10)::int || '_' || floor(origin_lng * 10)::int
WHERE origin_cell IS NULL AND origin_lat IS NOT NULL AND origin_lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rides_origin_cell ON chegoja.rides (origin_cell);

-- ------------------------------------------------------------
-- 2. DEVOLUÇÃO DE CUPOM
--    O cupom é consumido na criação da corrida; se ela for
--    cancelada ou expirar sem motorista, o uso é devolvido.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION chegoja.decrement_coupon_usage(coupon_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    rows_updated INTEGER;
BEGIN
    UPDATE chegoja.coupons
    SET used_quantity = GREATEST(used_quantity - 1, 0),
        -- Reativa apenas se tinha esgotado (não desfaz desativação manual do admin)
        is_active = CASE WHEN used_quantity >= total_quantity THEN TRUE ELSE is_active END
    WHERE id = coupon_id
      AND used_quantity > 0;

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    RETURN rows_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION chegoja.decrement_coupon_usage(UUID) TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 3. EXPIRAÇÃO AUTOMÁTICA de corridas 'searching'
--    Cancela corridas paradas há mais de X minutos e devolve os cupons.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION chegoja.expire_stale_rides(max_age_minutes INT DEFAULT 10)
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    WITH expired AS (
        UPDATE chegoja.rides
        SET status = 'cancelled', updated_at = NOW()
        WHERE status = 'searching'
          AND created_at < NOW() - (max_age_minutes || ' minutes')::interval
        RETURNING coupon_id
    ),
    refunds AS (
        UPDATE chegoja.coupons c
        SET used_quantity = GREATEST(c.used_quantity - r.cnt, 0),
            is_active = CASE WHEN c.used_quantity >= c.total_quantity THEN TRUE ELSE c.is_active END
        FROM (
            SELECT coupon_id, COUNT(*)::int AS cnt
            FROM expired
            WHERE coupon_id IS NOT NULL
            GROUP BY coupon_id
        ) r
        WHERE c.id = r.coupon_id
    )
    SELECT COUNT(*) INTO expired_count FROM expired;

    RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION chegoja.expire_stale_rides(INT) TO service_role;

-- Agenda a limpeza a cada minuto, se o pg_cron estiver instalado.
-- (Sem pg_cron, a expiração ainda acontece pelo app: o cliente cancela
--  automaticamente em 10 min e o motorista ignora corridas antigas.)
DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-stale-rides') THEN
            PERFORM cron.unschedule('expire-stale-rides');
        END IF;
        PERFORM cron.schedule(
            'expire-stale-rides',
            '* * * * *',
            $cron$ SELECT chegoja.expire_stale_rides(10); $cron$
        );
        RAISE NOTICE 'pg_cron: job expire-stale-rides agendado (a cada minuto).';
    ELSE
        RAISE NOTICE 'pg_cron NÃO instalado — expiração roda só pelo app (10 min). Para instalar: CREATE EXTENSION pg_cron;';
    END IF;
END
$do$;

-- Verificação rápida (opcional):
-- SELECT chegoja.expire_stale_rides(10);          -- expira agora e retorna a contagem
-- SELECT id, status, origin_cell FROM chegoja.rides ORDER BY created_at DESC LIMIT 5;
