-- ============================================================
-- RAIO DE CHAMADAS (multi-cidades)
-- Motoristas só recebem chamadas de corridas num raio de X km
-- (padrão: 10 km). Executar no SQL Editor do Supabase.
-- ============================================================

-- 1. Coluna de configuração do raio (ajustável pelo admin)
ALTER TABLE chegoja.app_settings
    ADD COLUMN IF NOT EXISTS ride_radius_km NUMERIC DEFAULT 10;

UPDATE chegoja.app_settings SET ride_radius_km = 10 WHERE ride_radius_km IS NULL;

-- 2. RPC: tokens de push apenas de motoristas dentro do raio da origem da corrida
--    Usa a última posição conhecida do motorista (profiles.lat / profiles.lng),
--    atualizada pelo app a cada ~10 segundos.
CREATE OR REPLACE FUNCTION chegoja.get_push_tokens_nearby(
    origin_lat DOUBLE PRECISION,
    origin_lng DOUBLE PRECISION,
    radius_km DOUBLE PRECISION DEFAULT 10
)
RETURNS TABLE(token TEXT, user_id UUID, username TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT pt.token, pt.user_id, p.username
    FROM chegoja.push_tokens pt
    JOIN chegoja.profiles p ON pt.user_id = p.id
    WHERE p.role = 'driver'
      AND p.lat IS NOT NULL
      AND p.lng IS NOT NULL
      -- Distância Haversine em km
      AND (
        2 * 6371 * asin(
            sqrt(
                power(sin(radians((p.lat - origin_lat) / 2)), 2) +
                cos(radians(origin_lat)) * cos(radians(p.lat)) *
                power(sin(radians((p.lng - origin_lng) / 2)), 2)
            )
        )
      ) <= radius_km;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION chegoja.get_push_tokens_nearby(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) TO service_role;

-- 3. Verificação rápida (opcional): motoristas num raio de 10km de um ponto
-- SELECT * FROM chegoja.get_push_tokens_nearby(-7.119, -34.845, 10);
