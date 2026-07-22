// ============================================================
// EFÍ BANK (Gerencianet) — Configuração via variáveis de ambiente
// ------------------------------------------------------------
// NENHUMA credencial fica hardcoded neste arquivo.
//
// No Supabase Edge Functions, defina as variáveis em:
//   Project Settings → Edge Functions → Secrets
// ou via CLI:
//   supabase secrets set EFI_P12_BASE64=...
//   supabase secrets set EFI_P12_PASS=...
//   supabase secrets set EFI_CLIENT_ID=...
//   supabase secrets set EFI_CLIENT_SECRET=...
//   supabase secrets set EFI_PIX_KEY=...
// ============================================================

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(
      `Variável de ambiente "${name}" não definida. ` +
      `Configure nos Secrets da Edge Function (Supabase Dashboard → Edge Functions → Secrets).`
    );
  }
  return value;
}

// Certificado P12 em Base64 (producao-664909-ghegojapro.p12)
export const EFI_P12_BASE64 = requiredEnv('EFI_P12_BASE64');

// Senha do P12 (vazia para este certificado)
export const EFI_P12_PASS = Deno.env.get('EFI_P12_PASS') || '';

// Credenciais de Produção
export const EFI_CLIENT_ID = requiredEnv('EFI_CLIENT_ID');
export const EFI_CLIENT_SECRET = requiredEnv('EFI_CLIENT_SECRET');

// URL base da API (produção)
export const EFI_BASE_URL = Deno.env.get('EFI_BASE_URL') || 'https://api-pix.gerencianet.com.br';

// Chave Pix de Produção
export const EFI_PIX_KEY = requiredEnv('EFI_PIX_KEY');
