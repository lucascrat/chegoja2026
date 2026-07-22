import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import forge from "https://esm.sh/node-forge@1.3.1";
import { EFI_P12_BASE64, EFI_P12_PASS, EFI_CLIENT_ID, EFI_CLIENT_SECRET, EFI_BASE_URL, EFI_PIX_KEY } from "./efi-config.ts";

const PLANS: Record<string, { title: string; price: number }> = {
  'plan_24h': { title: 'Plano Diário', price: 10.00 },
  'plan_7d': { title: 'Plano Semanal', price: 33.00 },
  'plan_15d': { title: 'Plano Quinzenal', price: 66.00 },
  'plan_30d': { title: 'Plano Mensal', price: 100.00 }
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

let cachedCert: { cert: string, key: string } | null = null;
let cachedToken: { token: string, expires: number } | null = null;

function getMTLSCredentials() {
  if (cachedCert) return cachedCert;

  try {
    const cleanBase64 = EFI_P12_BASE64.replace(/[^A-Za-z0-9+/=]/g, "");
    const p12Der = forge.util.decode64(cleanBase64);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, EFI_P12_PASS || "");

    let cert = "";
    let key = "";

    const allCerts = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
    const shroudedKeys = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
    const plainKeys = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [];
    const allKeys = [...shroudedKeys, ...plainKeys];

    if (allKeys.length === 0 || allCerts.length === 0) {
      throw new Error("Certificado ou Chave ausente no arquivo P12.");
    }

    let selectedKeyBag = allKeys[0];
    let leafCert = allCerts[0];

    if (selectedKeyBag.attributes && selectedKeyBag.attributes.localKeyId) {
      const pair = allCerts.find(c => c.attributes && c.attributes.localKeyId === selectedKeyBag.attributes.localKeyId);
      if (pair) leafCert = pair;
    }

    key = forge.pki.privateKeyToPem(selectedKeyBag.key!);
    const otherCerts = allCerts.filter(c => c !== leafCert);
    cert = [leafCert, ...otherCerts].map(bag => forge.pki.certificateToPem(bag.cert!)).join("\n");

    cachedCert = { cert, key };
    return cachedCert;
  } catch (err: any) {
    throw new Error(`Falha no Certificado: ${err.message}`);
  }
}

async function getEfiAccessToken() {
  if (cachedToken && cachedToken.expires > Date.now()) {
    return cachedToken.token;
  }

  const { cert, key } = getMTLSCredentials();
  const credentials = btoa(`${EFI_CLIENT_ID}:${EFI_CLIENT_SECRET}`);

  const client = Deno.createHttpClient({
    certChain: cert,
    privateKey: key,
  });

  const response = await fetch(`${EFI_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
    client: client as any,
  } as any);

  const data = await response.json();
  if (!response.ok) throw new Error(`Erro OAuth Efí: ${data.error_description || data.error}`);

  cachedToken = {
    token: data.access_token,
    expires: Date.now() + (data.expires_in * 1000) - 60000
  };

  return data.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { action, planId, user, payerData, paymentId } = await req.json();
    const returnError = (msg: string) => {
      return new Response(JSON.stringify({ error: msg, success: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    };

    if (action === 'create') {
      const plan = planId ? PLANS[planId] : null;
      const price = plan ? plan.price : (payerData?.product?.price_brl || 0);
      if (price <= 0) return returnError("Valor inválido.");

      const accessToken = await getEfiAccessToken();
      const { cert, key } = getMTLSCredentials();
      const client = Deno.createHttpClient({ certChain: cert, privateKey: key });

      const cobBody = {
        calendario: { expiracao: 3600 },
        devedor: {
          cpf: String(payerData.cpf).replace(/\D/g, ''),
          nome: `${payerData.firstName} ${payerData.lastName}`.trim()
        },
        valor: { original: price.toFixed(2) },
        chave: EFI_PIX_KEY,
        solicitacaoPagador: `Pagamento ${plan ? plan.title : payerData.product?.name}`
      };

      const cobRes = await fetch(`${EFI_BASE_URL}/v2/cob`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(cobBody),
        client: client as any
      } as any);

      const cobData = await cobRes.json();
      if (!cobRes.ok) return returnError(cobData.mensagem || "Erro ao criar cobrança Pix.");

      const locId = cobData.loc.id;
      const qrRes = await fetch(`${EFI_BASE_URL}/v2/loc/${locId}/qrcode`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${accessToken}` },
        client: client as any
      } as any);

      const qrData = await qrRes.json();
      if (!qrRes.ok) return returnError("Erro ao gerar QR Code.");

      return new Response(JSON.stringify({
        success: true,
        id: cobData.txid,
        status: 'pending',
        point_of_interaction: {
          transaction_data: {
            qr_code: qrData.qrcode,
            qr_code_base64: qrData.imagemQrcode.split(',')[1]
          }
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'check') {
      const accessToken = await getEfiAccessToken();
      const { cert, key } = getMTLSCredentials();
      const client = Deno.createHttpClient({ certChain: cert, privateKey: key });

      const resp = await fetch(`${EFI_BASE_URL}/v2/cob/${paymentId}`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${accessToken}` },
        client: client as any
      } as any);

      const data = await resp.json();
      const statusMap: any = { 'CONCLUIDA': 'approved', 'ATIVA': 'pending' };

      return new Response(JSON.stringify({
        status: statusMap[data.status] || 'pending',
        success: data.status === 'CONCLUIDA'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return returnError("Ação não suportada.");

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message, success: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });
  }
});