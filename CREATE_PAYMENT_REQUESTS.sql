-- Create/ensure Payment Requests table (idempotente)
-- IMPORTANTE: O app usa autenticação própria (tabela profiles), NÃO o Supabase Auth.
-- Por isso as políticas são permissivas (USING true).

CREATE TABLE IF NOT EXISTS chegoja.payment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES chegoja.profiles(id) ON DELETE CASCADE,
    amount_money NUMERIC(10,2) DEFAULT 0,
    amount_coins INTEGER DEFAULT 0,
    pix_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, paid, rejected
    type TEXT NOT NULL,                       -- driver_payout, client_withdrawal
    admin_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Garantir colunas caso a tabela já exista sem elas
ALTER TABLE chegoja.payment_requests ADD COLUMN IF NOT EXISTS admin_note TEXT;
ALTER TABLE chegoja.payment_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- RLS permissivo (app usa anon key com auth própria)
ALTER TABLE chegoja.payment_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total" ON chegoja.payment_requests;
DROP POLICY IF EXISTS "Users can create their own requests" ON chegoja.payment_requests;
DROP POLICY IF EXISTS "Users can view their own requests" ON chegoja.payment_requests;
DROP POLICY IF EXISTS "Admins can view all requests" ON chegoja.payment_requests;
DROP POLICY IF EXISTS "Admins can update requests" ON chegoja.payment_requests;

CREATE POLICY "Acesso total" ON chegoja.payment_requests FOR ALL USING (true) WITH CHECK (true);

-- Grants
GRANT ALL ON chegoja.payment_requests TO anon, authenticated, service_role;
