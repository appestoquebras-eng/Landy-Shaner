
declare const EdgeRuntime: any;
export async function panelSignature(value:string, key:string) {
 const secret=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',secret,new TextEncoder().encode('landy-panel:'+value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function validPanelToken(token:string,key:string,now=Date.now()) {
 const [expires,nonce,signature,...extra]=token.split('.');
 if(!key||extra.length||!/^\d{13}$/.test(expires||'')||! /^[a-f0-9-]{36}$/.test(nonce||'')||Number(expires)<=now||Number(expires)>now+3600000||! /^[a-f0-9]{64}$/.test(signature||''))return false;
 return timingSafeEqualStr(signature,await panelSignature(expires+'.'+nonce,key));
}
export async function sendMetaEvent(token:string,version:string,event:unknown,fetchFn:typeof fetch=fetch,testCode?:string) {
 const body:any={data:[event]}; if(testCode)body.test_event_code=testCode;
 const res=await fetchFn('https://graph.facebook.com/'+version+'/1641693707389160/events',{
  method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
  body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 const result=await res.json().catch(()=>({}));
 return {ok:res.ok&&Number(result.events_received)>=1,retry:res.status===429||res.status>=500||Boolean(result.error?.is_transient),code:String(res.status)};
}
export async function processMetaBatch(sb:any,token:string,version:string,fetchFn:typeof fetch=fetch) {
 if(!token)return {configured:false};
 const {data,error}=await sb.rpc('meta_claim_batch'); if(error)throw new Error('META_CLAIM');
 let sent=0;
 for(const item of data||[]) {
  let result:any={ok:false,retry:true,code:'NETWORK'};
  if(Number(item.payload.event_time)<Math.floor(Date.now()/1000)-6*86400)result={ok:false,retry:false,code:'TOO_OLD'};
  else try{result=await sendMetaEvent(token,version,item.payload,fetchFn);}catch{}
  const state=result.ok?'sent':result.retry?'pending':'attention';
  const {error:finishError}=await sb.rpc('meta_finish',{p_event_id:item.event_id,p_lease_id:item.lease_id,p_result:state,p_code:result.code});
  if(finishError)throw new Error('META_FINISH'); if(result.ok)sent++;
 }
 return {configured:true,sent};
}
// =========================================================================
// SUPABASE EDGE FUNCTION: checkout-api
// Runtime: Deno (100% Free no Supabase Edge Functions)
// =========================================================================

declare const Deno: any;
declare const process: any;

export const CATALOG = {
  KIT_ID: 'kit-depilador-4em1',
  KIT_NAME: 'Kit Depilador 4 em 1 Landy Shaner',
  KIT_PRICE_CENTS: 3490, // R$ 34,90
  CREAM_ID: 'creme-clareador-clear-beauty',
  CREAM_NAME: 'Creme Clareador Íntimo e Corporal Clear Beauty',
  CREAM_PRICE_CENTS: 1500, // R$ 15,00
  CURRENCY: 'BRL',
};

export const VALID_UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

export const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function isValidCPF(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean.charAt(i), 10) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9), 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean.charAt(i), 10) * (11 - i);
  }
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(10), 10)) return false;

  return true;
}

export function isValidPhone(phone: string): boolean {
  const clean = phone.replace(/\D/g, '');
  if (clean.length !== 10 && clean.length !== 11) return false;
  const ddd = parseInt(clean.substring(0, 2), 10);
  return ddd >= 11 && ddd <= 99;
}

export async function sha256Hex(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function calculateOrderAmounts(quantity: number, includeCream: boolean) {
  const safeQty = Math.max(1, Math.min(10, Math.floor(quantity || 1)));
  const kitUnitCents = safeQty>=2?Math.round(CATALOG.KIT_PRICE_CENTS*0.9):CATALOG.KIT_PRICE_CENTS;
  const kitTotalCents = safeQty * kitUnitCents;
  const creamTotalCents = includeCream ? CATALOG.CREAM_PRICE_CENTS : 0;
  const amountCents = kitTotalCents + creamTotalCents;
  const amountReais = Number((amountCents / 100).toFixed(2));

  const items = [
    {
      id: CATALOG.KIT_ID,
      name: CATALOG.KIT_NAME,
      quantity: safeQty,
      price: Number((kitUnitCents / 100).toFixed(2)),
      physical: true,
    },
  ];

  if (includeCream) {
    items.push({
      id: CATALOG.CREAM_ID,
      name: CATALOG.CREAM_NAME,
      quantity: 1,
      price: Number((CATALOG.CREAM_PRICE_CENTS / 100).toFixed(2)),
      physical: true,
    });
  }

  return { amountCents, amountReais, items };
}

export interface CheckoutHandlerDeps {
  supabaseClient?: any;
  sigilopayPublicKey?: string;
  sigilopaySecretKey?: string;
  sigilopayCallbackUrl?: string;
  sigilopayBaseUrl?: string;
  allowedOrigins?: string[];
  fetchFn?: typeof fetch;
  metaToken?: string;
  metaVersion?: string;
}

export function createCheckoutHandler(deps: CheckoutHandlerDeps = {}) {
  const getEnv = (key: string) => {
    if (typeof Deno !== 'undefined' && Deno.env) {
      return Deno.env.get(key) || '';
    }
    return (process.env as any)?.[key] || '';
  };

  const SIGILOPAY_PUBLIC_KEY = deps.sigilopayPublicKey || getEnv('SIGILOPAY_PUBLIC_KEY');
  const SIGILOPAY_SECRET_KEY = deps.sigilopaySecretKey || getEnv('SIGILOPAY_SECRET_KEY');
  const SIGILOPAY_CALLBACK_URL = deps.sigilopayCallbackUrl || getEnv('SIGILOPAY_CALLBACK_URL');
  const SIGILOPAY_BASE_URL = deps.sigilopayBaseUrl || getEnv('SIGILOPAY_BASE_URL') || 'https://app.sigilopay.com.br/api/v1';
  const customOrigins = deps.allowedOrigins || (getEnv('ALLOWED_ORIGINS') ? getEnv('ALLOWED_ORIGINS').split(',').map((s: string) => s.trim()) : []);

  // CORS Estrito: Apenas igualdade exata (NUNCA .endsWith('.pages.dev') que abriria para atacantes)
  const ALLOWED_ORIGINS = new Set([
    'https://landy-shaner.pages.dev',
    ...customOrigins.filter(Boolean),
  ]);

  const fetchClient = deps.fetchFn || fetch;
  const metaToken=deps.metaToken||getEnv('META_ACCESS_TOKEN');
  const metaVersion=deps.metaVersion||getEnv('META_GRAPH_VERSION')||'v25.0';
  const metaDb=async()=>{if(deps.supabaseClient)return deps.supabaseClient;
    // @ts-ignore Deno resolves npm imports
    const {createClient}=await import('npm:@supabase/supabase-js@2.117.2');
    return createClient(getEnv('SUPABASE_URL'),getEnv('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});};

  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('Origin');
    const isOptions = req.method === 'OPTIONS';

    const url = new URL(req.url);
    let pathname = url.pathname.replace(/^\/functions\/v1/, '').replace(/^\/checkout-api/, '');
    if (!pathname.startsWith('/')) pathname = '/' + pathname;

    const isWebhook = pathname === '/webhook';

    // Validação estrita de CORS para requisições de navegador
    if (origin && !isWebhook) {
      if (!ALLOWED_ORIGINS.has(origin) && !ALLOWED_ORIGINS.has('*')) {
        return new Response(
          JSON.stringify({ error: 'Origem CORS não autorizada.' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    const corsHeaders: HeadersInit = {
      'Access-Control-Allow-Origin': origin && (ALLOWED_ORIGINS.has(origin) || ALLOWED_ORIGINS.has('*')) ? origin : 'https://landy-shaner.pages.dev',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
      'Content-Type': 'application/json',
    };

    if (isOptions) {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      if(pathname.startsWith('/panel/')||pathname.startsWith('/analytics/')) {
        const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Cache-Control':'no-store'}});
        const sb=await metaDb();
        if(pathname==='/panel/login'&&req.method==='POST') {
          const b=await req.json().catch(()=>({}));
          if(typeof b.password!=='string'||b.password.length>128)return reply({error:'Senha inválida.'},401);
          const ip=req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
          const {data,error}=await sb.rpc('store_panel_login',{p_ip_hash:await sha256Hex(ip),p_password:b.password});
          if(error)return reply({error:'Painel temporariamente indisponível.'},503);
          if(!data)return reply({error:'Senha incorreta ou limite de tentativas atingido. Aguarde 15 minutos para tentar novamente.'},401);
          const key=getEnv('SUPABASE_SERVICE_ROLE_KEY');if(!key)return reply({error:'Painel indisponível.'},503);
          const value=String(Date.now()+3600000)+'.'+crypto.randomUUID();
          return reply({token:value+'.'+await panelSignature(value,key)});
        }
        if(pathname==='/panel/stats'&&req.method==='GET') {
          if(!await validPanelToken((req.headers.get('Authorization')||'').replace(/^Bearer /,''),getEnv('SUPABASE_SERVICE_ROLE_KEY')))return reply({error:'Sessão expirada ou acesso não autorizado.'},401);
          const days=Number(url.searchParams.get('days')||30);if(![0,1,7,30].includes(days))return reply({error:'Período inválido.'},400);
          const {data,error}=await sb.rpc('store_panel_stats',{p_days:days});
          return error?reply({error:'Não foi possível consultar os números.'},503):reply(data);
        }
        if(pathname==='/analytics/event'&&req.method==='POST') {
          const b=await req.json().catch(()=>({}));
          if(!['visit','checkout'].includes(b.event)||! /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(b.visitor||''))return reply({error:'Evento inválido.'},400);
          const {error}=await sb.from('store_events').upsert({visitor:b.visitor,event:b.event},{onConflict:'visitor,event,event_day',ignoreDuplicates:true});
          return reply({success:!error},error?503:200);
        }
        if(pathname==='/analytics/copy'&&req.method==='POST') {
          const b=await req.json().catch(()=>({}));
          if(typeof b.token!=='string'||b.token.length<32||b.token.length>128||typeof b.orderId!=='string'||b.orderId.length>80)return reply({error:'Pedido inválido.'},400);
          const {data:order}=await sb.from('orders').select('order_id,guest_token_hash,pix_code').eq('order_id',b.orderId).maybeSingle();
          if(!order?.pix_code||!timingSafeEqualStr(order.guest_token_hash,await sha256Hex(b.token)))return reply({error:'Pedido não autorizado.'},403);
          const {error}=await sb.from('store_pix_copies').upsert({order_id:b.orderId},{onConflict:'order_id',ignoreDuplicates:true});
          return reply({success:!error},error?503:200);
        }
        return reply({error:'Rota não encontrada.'},404);
      }
      if(['/meta/process','/meta/test'].includes(pathname)) {
        if(!metaToken)return new Response(JSON.stringify({error:'Meta não configurada'}),{status:503,headers:corsHeaders});
        if(req.method!=='POST'||!timingSafeEqualStr(req.headers.get('Authorization')||'','Bearer '+metaToken))return new Response(JSON.stringify({error:'Não autorizado'}),{status:401,headers:corsHeaders});
        const result=pathname==='/meta/test'
          ? await sendMetaEvent(metaToken,metaVersion,{event_name:'Purchase',event_time:Math.floor(Date.now()/1000),event_id:'test_'+crypto.randomUUID(),action_source:'website',event_source_url:'https://landy-shaner.pages.dev/',user_data:{external_id:[await sha256Hex('meta-synthetic-test')]},custom_data:{currency:'BRL',value:34.90}},fetchClient,'TEST77664')
          : await processMetaBatch(await metaDb(),metaToken,metaVersion,fetchClient);
        return new Response(JSON.stringify(result),{status:(result as any).ok===false?502:200,headers:corsHeaders});
      }
      if (pathname === '/health' || pathname === '/') {
        let databaseReady: boolean | undefined;
        if (url.searchParams.get('check') === 'database') {
          let sb = deps.supabaseClient;
          if (!sb && typeof Deno !== 'undefined') {
            // @ts-ignore Deno resolves this package during Supabase deployment.
            const { createClient } = await import('npm:@supabase/supabase-js@2.117.2');
            sb = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false } });
          }
          if (!sb) databaseReady = false;
          else {
            const { error } = await sb.from('orders').select('order_id').eq('order_id','health-probe-no-order').maybeSingle();
            databaseReady = !error;
          }
        }
        return new Response(
          JSON.stringify({
            status: 'ok',
            service: 'landy-shaner-edge-checkout',
            databaseReady,
            sigilopayConfigured: Boolean(SIGILOPAY_PUBLIC_KEY && SIGILOPAY_SECRET_KEY && SIGILOPAY_CALLBACK_URL),
          }),
          { status: databaseReady === false ? 503 : 200, headers: corsHeaders }
        );
      }

      // ---------------------------------------------------------------------
      // 1. CRIAR COBRANÇA PIX (/create)
      // ---------------------------------------------------------------------
      if (pathname === '/create' && req.method === 'POST') {
        // Validação de tamanho por byteLength real do corpo
        const rawText = await req.text();
        const byteLength = new TextEncoder().encode(rawText).byteLength;
        if (byteLength > 16384) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'Corpo da requisição excede limite de 16KB.' } }),
            { status: 413, headers: corsHeaders }
          );
        }

        // Validação de credenciais ANTES de tocar no banco
        if (!SIGILOPAY_PUBLIC_KEY || !SIGILOPAY_SECRET_KEY || !SIGILOPAY_CALLBACK_URL) {
          return new Response(
            JSON.stringify({
              success: false,
              error: {
                errorCode: 'GATEWAY_NOT_CONFIGURED',
                message: 'Chaves da Sigilo Pay não configuradas no servidor.',
              },
            }),
            { status: 503, headers: corsHeaders }
          );
        }

        let body: any = {};
        try {
          body = JSON.parse(rawText || '{}');
        } catch {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'JSON inválido no corpo da requisição.' } }),
            { status: 400, headers: corsHeaders }
          );
        }

        const {
          idempotencyKey,
          clientGuestToken,
          name,
          email,
          phone,
          document,
          postalCode,
          street,
          houseNumber,
          complement,
          district,
          city,
          state,
          quantity,
          includeCream,
        } = body;

        // Validação de chaves criptográficas obrigatórias (mínimo 32 caracteres)
        const KEY_REGEX = /^[a-zA-Z0-9_-]{32,128}$/;
        if (!idempotencyKey || typeof idempotencyKey !== 'string' || !KEY_REGEX.test(idempotencyKey.trim())) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'idempotencyKey obrigatória (chave criptográfica de no mínimo 32 caracteres).' } }),
            { status: 400, headers: corsHeaders }
          );
        }

        if (!clientGuestToken || typeof clientGuestToken !== 'string' || !KEY_REGEX.test(clientGuestToken.trim())) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'clientGuestToken obrigatório (token criptográfico de no mínimo 32 caracteres).' } }),
            { status: 400, headers: corsHeaders }
          );
        }

        if (!name || typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 100 || name.trim().split(' ').length < 2) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'Nome completo obrigatório (nome e sobrenome, max 100 caracteres).' } }),
            { status: 400, headers: corsHeaders }
          );
        }

        if (!email || typeof email !== 'string' || email.trim().length > 100 || !EMAIL_REGEX.test(email.trim())) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'E-mail obrigatório com formato válido.' } }),
            { status: 400, headers: corsHeaders }
          );
        }

        const cleanPhone = String(phone || '').replace(/\D/g, '');
        if (!isValidPhone(cleanPhone)) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'Telefone com DDD válido obrigatório (10 ou 11 dígitos).' } }),
            { status: 400, headers: corsHeaders }
          );
        }

        const cleanCpf = String(document || '').replace(/\D/g, '');
        if (!isValidCPF(cleanCpf)) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'CPF inválido (dígitos verificadores incorretos).' } }),
            { status: 400, headers: corsHeaders }
          );
        }

        const cleanCep = String(postalCode || '').replace(/\D/g, '');
        if (cleanCep.length !== 8) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'CEP inválido (8 dígitos numéricos).' } }),
            { status: 400, headers: corsHeaders }
          );
        }

        if (!street || typeof street !== 'string' || street.trim().length < 2 || street.trim().length > 120 ||
            !houseNumber || typeof houseNumber !== 'string' || houseNumber.trim().length < 1 || houseNumber.trim().length > 20 ||
            !district || typeof district !== 'string' || district.trim().length < 2 || district.trim().length > 60 ||
            !city || typeof city !== 'string' || city.trim().length < 2 || city.trim().length > 60) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'Endereço de entrega incompleto ou inválido.' } }),
            { status: 400, headers: corsHeaders }
          );
        }

        const cleanState = String(state || '').trim().toUpperCase();
        if (!VALID_UFS.has(cleanState)) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'UF inválida (estado brasileiro inexistente).' } }),
            { status: 400, headers: corsHeaders }
          );
        }

        if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'Quantidade deve ser um número inteiro de 1 a 10.' } }),
            { status: 400, headers: corsHeaders }
          );
        }

        if (typeof includeCream !== 'boolean') {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'Opção de clareador deve ser um booleano.' } }),
            { status: 400, headers: corsHeaders }
          );
        }

        const safeIdemKey = idempotencyKey.trim();
        const safeGuestToken = clientGuestToken.trim();
        const guestTokenHash = await sha256Hex(safeGuestToken);

        const { amountCents, amountReais, items } = calculateOrderAmounts(quantity, includeCream);

        // Bind criptográfico do payload com a chave para detectar reuso indevido
        const payloadHash = await sha256Hex(
          JSON.stringify([name.trim(),email.trim().toLowerCase(),cleanPhone,cleanCpf,cleanCep,street.trim(),houseNumber.trim(),complement ? String(complement).trim().slice(0,60) : null,district.trim(),city.trim(),cleanState,quantity,includeCream,amountCents])
        );

        // Gera OrderID robusto baseado em UUID para evitar colisão
        const entropy = crypto.randomUUID().replace(/-/g, '').toUpperCase();
        const newOrderId = `LS-${entropy}`;
        const newIdentifier = `sig_${newOrderId.toLowerCase()}_${Date.now()}`;

        let sb = deps.supabaseClient;
        if (!sb && typeof Deno !== 'undefined') {
          // @ts-ignore Deno resolves this package during Supabase deployment.
          const { createClient } = await import('npm:@supabase/supabase-js@2.117.2');
          const sbUrl = Deno.env.get('SUPABASE_URL') || '';
          const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
          sb = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
        }

        if (!sb) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'Configuração do Supabase indisponível no backend.' } }),
            { status: 500, headers: corsHeaders }
          );
        }

        // RPC com Dual Advisory Lock (Key + CPF) e verificação de payload
        const { data: orderAttempt, error: rpcError } = await sb.rpc(
          'rpc_create_or_get_pending_order',
          {
            p_idempotency_key: safeIdemKey,
            p_order_id: newOrderId,
            p_identifier: newIdentifier,
            p_customer_name: name.trim(),
            p_customer_email: email.trim().toLowerCase(),
            p_customer_phone: cleanPhone,
            p_customer_cpf: cleanCpf,
            p_postal_code: cleanCep,
            p_street: street.trim(),
            p_house_number: houseNumber.trim(),
            p_complement: complement ? String(complement).trim().slice(0, 60) : null,
            p_district: district.trim(),
            p_city: city.trim(),
            p_state: cleanState,
            p_quantity: quantity,
            p_include_cream: includeCream,
            p_total_price: amountReais,
            p_amount_cents: amountCents,
            p_guest_token_hash: guestTokenHash,
            p_payload_hash: payloadHash,
          }
        );

        if (rpcError) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'Erro interno ao registrar pedido.' } }),
            { status: 500, headers: corsHeaders }
          );
        }

        const row = Array.isArray(orderAttempt) ? orderAttempt[0] : orderAttempt;

        if (row?.is_abusive) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'Limite de tentativas excedido para este CPF. Tente mais tarde.' } }),
            { status: 429, headers: corsHeaders }
          );
        }

        if (row?.token_mismatch || row?.payload_mismatch) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'Conflito de integridade com chave de checkout existente.' } }),
            { status: 409, headers: corsHeaders }
          );
        }

        if(body.marketing && typeof body.marketing.consent==='boolean') {
          const m=body.marketing;
          const context:any={};
          if(m.consent===true){context.em=[await sha256Hex(email.trim().toLowerCase())];context.ph=[await sha256Hex('55'+cleanPhone)];
            if(typeof m.userAgent==='string')context.client_user_agent=m.userAgent.slice(0,512);
            for(const k of ['fbp','fbc'])if(typeof m[k]==='string'&&/^fb\.\d\.\d{10,13}\.[A-Za-z0-9_.-]{1,300}$/.test(m[k]))context[k]=m[k];}
          const {data:contextOk,error:contextError}=await sb.rpc('meta_set_context',{p_order_id:row.order_id||newOrderId,p_guest_hash:guestTokenHash,p_consent:m.consent===true,p_context:context});
          if(contextError||!contextOk)return new Response(JSON.stringify({success:false,error:{message:'Erro ao salvar preferências. Nenhuma nova cobrança gerada.'}}),{status:500,headers:corsHeaders});
        }
        // Se o pedido já existia para esta chave de idempotência
        if (row?.existing) {
          // Se já está pago, retorna pago sem gerar QR code
          if (row.status === 'paid') {
            return new Response(
              JSON.stringify({
                success: true,
                orderId: row.order_id,
                guestToken: safeGuestToken,
                status: 'paid',
                totalPrice: Number(row.total_price),
              }),
              { status: 200, headers: corsHeaders }
            );
          }

          // Se está em creating ou uncertain, NUNCA chama o gateway novamente
          if (row.status === 'creating') {
            return new Response(
              JSON.stringify({
                success: false,
                status: 'creating',
                error: { message: 'Cobrança em processamento preliminar. Aguarde alguns instantes.' },
              }),
              { status: 409, headers: corsHeaders }
            );
          }

          if (row.status === 'uncertain') {
            return new Response(
              JSON.stringify({
                success: false,
                status: 'uncertain',
                error: { message: 'Cobrança aguardando confirmação do gateway. Não tente recriar para evitar cobrança dupla.' },
              }),
              { status: 409, headers: corsHeaders }
            );
          }

          if (['canceled', 'refunded', 'charged_back'].includes(row.status)) {
            return new Response(
              JSON.stringify({
                success: false,
                status: row.status,
                error: { message: `Este pedido está cancelado ou estornado (${row.status}). Inicie uma nova compra.` },
              }),
              { status: 409, headers: corsHeaders }
            );
          }

          // Se está pendente e possui pix_code, reutiliza
          if (row.pix_code) {
            return new Response(
              JSON.stringify({
                success: true,
                orderId: row.order_id,
                guestToken: safeGuestToken,
                pixCode: row.pix_code,
                pixImage: row.pix_image || null,
                expiresAt: row.expires_at || null,
                totalPrice: Number(row.total_price),
                status: row.status,
              }),
              { status: 200, headers: corsHeaders }
            );
          }

          // Se por qualquer razão existente não tiver pix_code, NÃO chama fetch
          return new Response(
            JSON.stringify({
              success: false,
              status: row.status,
              error: { message: 'Pedido existente sem código Pix disponível. Aguarde reconciliação.' },
            }),
            { status: 409, headers: corsHeaders }
          );
        }

        const activeOrderId = row.order_id || newOrderId;
        const activeIdentifier = row.identifier || newIdentifier;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
          const sigiloRes = await fetchClient(`${SIGILOPAY_BASE_URL}/gateway/pix/receive`, {
            method: 'POST',
            headers: {
              'x-public-key': SIGILOPAY_PUBLIC_KEY,
              'x-secret-key': SIGILOPAY_SECRET_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              identifier: activeIdentifier,
              amount: amountReais,
              client: {
                name: name.trim(),
                email: email.trim().toLowerCase(),
                phone: cleanPhone,
                document: cleanCpf,
              },
              products: items,
              callbackUrl: SIGILOPAY_CALLBACK_URL,
              metadata: {
                provider: 'Checkout',
                orderId: activeOrderId,
              },
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          const sigiloJson = await sigiloRes.json().catch(() => ({}));

          // Se status HTTP não for OK OU resposta indicar falha expressa (success: false / status: FAILED)
          const isGatewayFailed = !sigiloRes.ok ||
            sigiloJson.status === 'FAILED' ||
            sigiloJson.success === false ||
            sigiloJson.transactionStatus === 'FAILED';

          if (isGatewayFailed) {
            await sb.rpc('rpc_attach_sigilopay_charge', {
              p_order_id: activeOrderId,
              p_identifier: activeIdentifier,
              p_transaction_id: null,
              p_webhook_token: null,
              p_pix_code: null,
              p_pix_image: null,
              p_expires_at: null,
              p_gateway_status: 'FAILED',
              p_status: 'uncertain',
            });

            return new Response(
              JSON.stringify({
                success: false,
                error: { message: sigiloJson.errorCode==='GATEWAY_INVALID_ARGUMENT'&&/^Valor mínimo para transação é de R\$ \d{1,6},\d{2}$/.test(String(sigiloJson.message||'')) ? String(sigiloJson.message) : 'Não foi possível gerar a cobrança Pix no gateway.' },
              }),
              { status: 502, headers: corsHeaders }
            );
          }

          const transactionId = String(sigiloJson.transactionId || sigiloJson.id || '').trim();
          const webhookToken = String(sigiloJson.webhookToken || sigiloJson.token || '').trim();
          const pixCode = String(sigiloJson.pix?.code || sigiloJson.pixCode || '').trim();
          const pixImage = sigiloJson.pix?.image ? String(sigiloJson.pix.image).trim() : null;
          const expiresAt = sigiloJson.pix?.expiresAt || sigiloJson.expiresAt || null;
          const gatewayStatus = sigiloJson.transactionStatus || sigiloJson.status || 'WAITING_PAYMENT';

          if (!transactionId || !webhookToken || !pixCode) {
            await sb.rpc('rpc_attach_sigilopay_charge', {
              p_order_id: activeOrderId,
              p_identifier: activeIdentifier,
              p_transaction_id: null,
              p_webhook_token: null,
              p_pix_code: null,
              p_pix_image: null,
              p_expires_at: null,
              p_gateway_status: 'INCOMPLETE_RESPONSE',
              p_status: 'uncertain',
            });

            return new Response(
              JSON.stringify({
                success: false,
                error: { message: 'A Sigilo Pay não retornou os dados completos da cobrança.' },
              }),
              { status: 502, headers: corsHeaders }
            );
          }

          const { data: attachOk, error: attachErr } = await sb.rpc('rpc_attach_sigilopay_charge', {
            p_order_id: activeOrderId,
            p_identifier: activeIdentifier,
            p_transaction_id: transactionId,
            p_webhook_token: webhookToken,
            p_pix_code: pixCode,
            p_pix_image: pixImage,
            p_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
            p_gateway_status: gatewayStatus,
            p_status: 'pending',
          });

          if (attachErr || !attachOk) {
            return new Response(
              JSON.stringify({
                success: false,
                error: { message: 'Falha de persistência ao salvar cobrança.' },
              }),
              { status: 500, headers: corsHeaders }
            );
          }

          return new Response(
            JSON.stringify({
              success: true,
              orderId: activeOrderId,
              guestToken: safeGuestToken,
              pixCode,
              pixImage,
              expiresAt,
              totalPrice: amountReais,
              status: 'pending',
            }),
            { status: 200, headers: corsHeaders }
          );
        } catch {
          clearTimeout(timeoutId);
          await sb.rpc('rpc_attach_sigilopay_charge', {
            p_order_id: activeOrderId,
            p_identifier: activeIdentifier,
            p_transaction_id: null,
            p_webhook_token: null,
            p_pix_code: null,
            p_pix_image: null,
            p_expires_at: null,
            p_gateway_status: 'TIMEOUT',
            p_status: 'uncertain',
          });

          return new Response(
            JSON.stringify({
              success: false,
              error: {
                errorCode: 'GATEWAY_TIMEOUT',
                message: 'Tempo esgotado ao contatar o gateway de pagamento. Cobrança registrada para reconciliação.',
              },
            }),
            { status: 504, headers: corsHeaders }
          );
        }
      }

      // ---------------------------------------------------------------------
      if(pathname==='/meta/withdraw'&&req.method==='POST') {
        const raw=await req.text();if(new TextEncoder().encode(raw).length>1024)return new Response('{}',{status:413,headers:corsHeaders});
        const b=JSON.parse(raw);const sb=await metaDb();
        const {data,error}=await sb.rpc('meta_set_context',{p_order_id:String(b.orderId||''),p_guest_hash:await sha256Hex(String(b.token||'')),p_consent:false,p_context:{}});
        return new Response(JSON.stringify({success:!error&&data===true}),{status:!error&&data===true?200:403,headers:corsHeaders});
      }
      // 2. CONSULTA SEGURA DE STATUS (/status)
      // ---------------------------------------------------------------------
      if (pathname === '/status' && req.method === 'GET') {
        const orderId = url.searchParams.get('orderId') || '';
        const guestToken = url.searchParams.get('token') || '';

        if (!orderId || !guestToken) {
          return new Response(
            JSON.stringify({ success: false, error: 'orderId e token são obrigatórios.' }),
            { status: 400, headers: corsHeaders }
          );
        }

        const inputHash = await sha256Hex(guestToken);

        let sb = deps.supabaseClient;
        if (!sb && typeof Deno !== 'undefined') {
          // @ts-ignore Deno resolves this package during Supabase deployment.
          const { createClient } = await import('npm:@supabase/supabase-js@2.117.2');
          sb = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false } });
        }

        const { data: order, error } = await sb
          .from('orders')
          .select('order_id, status, paid_at, total_price, quantity, include_cream, pix_code, pix_image, expires_at, guest_token_hash')
          .eq('order_id', orderId)
          .maybeSingle();

        if (error || !order) {
          return new Response(
            JSON.stringify({ success: false, error: 'Pedido não localizado.' }),
            { status: 404, headers: corsHeaders }
          );
        }

        if (!timingSafeEqualStr(order.guest_token_hash || '', inputHash)) {
          return new Response(
            JSON.stringify({ success: false, error: 'Acesso não autorizado para este pedido.' }),
            { status: 403, headers: corsHeaders }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            orderId: order.order_id,
            status: order.status,
            paidAt: order.paid_at || null,
            totalPrice: Number(order.total_price),
            quantity: order.quantity,
            includeCream: order.include_cream,
            pixCode: order.pix_code,
            pixImage: order.pix_image || null,
            expiresAt: order.expires_at || null,
          }),
          { status: 200, headers: corsHeaders }
        );
      }

      // ---------------------------------------------------------------------
      // 3. WEBHOOK OFICIAL SIGILO PAY (/webhook)
      // ---------------------------------------------------------------------
      if (pathname === '/webhook' && req.method === 'POST') {
        const rawText = await req.text();
        const byteLength = new TextEncoder().encode(rawText).byteLength;
        if (byteLength > 16384) {
          return new Response(
            JSON.stringify({ error: 'Payload excede 16KB.' }),
            { status: 413, headers: corsHeaders }
          );
        }

        let body: any = {};
        try {
          body = JSON.parse(rawText || '{}');
        } catch {
          return new Response(
            JSON.stringify({ error: 'Payload inválido.' }),
            { status: 400, headers: corsHeaders }
          );
        }

        const { event, token, transaction } = body;

        if (!token || !transaction || typeof transaction !== 'object') {
          return new Response(
            JSON.stringify({ error: 'Payload inválido: token e transaction são obrigatórios.' }),
            { status: 400, headers: corsHeaders }
          );
        }

        const transactionId = String(transaction.id || '').trim();
        const identifier = String(transaction.identifier || '').trim();

        if (!transactionId || !identifier) {
          return new Response(
            JSON.stringify({ error: 'transaction.id e identifier são obrigatórios.' }),
            { status: 400, headers: corsHeaders }
          );
        }

        let sb = deps.supabaseClient;
        if (!sb && typeof Deno !== 'undefined') {
          // @ts-ignore Deno resolves this package during Supabase deployment.
          const { createClient } = await import('npm:@supabase/supabase-js@2.117.2');
          sb = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false } });
        }

        // Busca ordem primariamente por transaction_id
        let order: any = null;
        if (transactionId) {
          const { data } = await sb.from('orders').select('*').eq('transaction_id', transactionId).maybeSingle();
          order = data;
        }

        // Se não encontrou por transaction_id, busca por identifier para detectar corridas
        if (!order && identifier) {
          const { data: pendingOrd } = await sb.from('orders').select('*').eq('identifier', identifier).maybeSingle();
          if (pendingOrd && ['creating', 'uncertain'].includes(pendingOrd.status)) {
            // Webhook chegou antes do retorno do gateway anexar o transaction_id/token
            return new Response(
              JSON.stringify({ error: 'Cobrança em persistência. Tente novamente em instantes.' }),
              { status: 503, headers: { ...corsHeaders, 'Retry-After': '3' } }
            );
          }
        }

        if (!order) {
          return new Response(
            JSON.stringify({ error: 'Pedido associado não localizado.' }),
            { status: 404, headers: corsHeaders }
          );
        }

        // Validação estrita de identificadores correspondentes
        if (order.transaction_id !== transactionId || order.identifier !== identifier) {
          return new Response(
            JSON.stringify({ error: 'Identificadores da transação inconsistentes com a cobrança salva.' }),
            { status: 400, headers: corsHeaders }
          );
        }

        // Validação estrita do webhook_token
        if (!order.webhook_token || !timingSafeEqualStr(order.webhook_token, String(token))) {
          return new Response(
            JSON.stringify({ error: 'Token de autenticação do webhook inválido.' }),
            { status: 401, headers: corsHeaders }
          );
        }

        // Valida moeda, método e valor em TODOS os eventos de confirmação ou alteração de estado
        if (String(transaction.currency || '').toUpperCase() !== 'BRL') {
          return new Response(
            JSON.stringify({ error: 'Moeda da transação inválida: esperado BRL.' }),
            { status: 400, headers: corsHeaders }
          );
        }

        if (transaction.paymentMethod !== 'PIX') {
          return new Response(
            JSON.stringify({ error: 'Método de pagamento inválido: esperado PIX.' }),
            { status: 400, headers: corsHeaders }
          );
        }

        const receivedCents = Math.round(Number(transaction.amount) * 100);
        if (receivedCents !== order.amount_cents) {
          return new Response(
            JSON.stringify({ error: 'Valor da transação não confere com o pedido.' }),
            { status: 400, headers: corsHeaders }
          );
        }

        // 1. EVENTO DE PAGAMENTO CONCLUÍDO (Exige AMBOS event E status)
        const isStrictPaid =
          event === 'TRANSACTION_PAID' &&
          transaction.status === 'COMPLETED';

        if (isStrictPaid) {
          const { data: confirmRes, error: confirmErr } = await sb.rpc(
            'rpc_confirm_sigilopay_payment',
            {
              p_transaction_id: order.transaction_id,
              p_identifier: order.identifier,
              p_payed_at: transaction.payedAt || new Date().toISOString(),
              p_gateway_status: 'COMPLETED',
            }
          );

          if (confirmErr) {
            return new Response(
              JSON.stringify({ error: 'Falha ao confirmar pagamento no banco.' }),
              { status: 500, headers: corsHeaders }
            );
          }

          const confirmRow = Array.isArray(confirmRes) ? confirmRes[0] : confirmRes;
          if (!confirmRow || !confirmRow.success) {
            return new Response(
              JSON.stringify({ error: confirmRow?.action || 'Transição de pagamento não permitida.' }),
              { status: 400, headers: corsHeaders }
            );
          }

          if(metaToken){const task=processMetaBatch(sb,metaToken,metaVersion,fetchClient).catch(()=>({configured:true,sent:0}));
            if(typeof EdgeRuntime!=='undefined')EdgeRuntime.waitUntil(task);else await task;}
          if (confirmRow.action === 'ALREADY_PAID') {
            return new Response(
              JSON.stringify({ received: true, status: 'already_paid' }),
              { status: 200, headers: corsHeaders }
            );
          }

          return new Response(
            JSON.stringify({ received: true, status: 'paid_confirmed' }),
            { status: 200, headers: corsHeaders }
          );
        }

        if (event === 'TRANSACTION_PAID') {
          return new Response(
            JSON.stringify({ error: 'Evento de pagamento não atende aos critérios estritos (status não é COMPLETED).' }),
            { status: 400, headers: corsHeaders }
          );
        }

        // 2. CANCELAMENTO (Exige AMBOS event E status)
        if (event === 'TRANSACTION_CANCELED' && transaction.status === 'CANCELED') {
          const { data: cancelRes, error: cancelErr } = await sb.rpc('rpc_update_order_cancellation', {
            p_transaction_id: order.transaction_id,
            p_identifier: order.identifier,
            p_new_status: 'canceled',
            p_gateway_status: 'CANCELED',
          });

          if (cancelErr) {
            return new Response(JSON.stringify({ error: 'Erro ao cancelar pedido.' }), { status: 500, headers: corsHeaders });
          }

          const cancelRow = Array.isArray(cancelRes) ? cancelRes[0] : cancelRes;
          if (!cancelRow || !cancelRow.success) {
            return new Response(JSON.stringify({ error: cancelRow?.action || 'Cancelamento rejeitado.' }), { status: 400, headers: corsHeaders });
          }

          return new Response(JSON.stringify({ received: true, status: 'canceled' }), { status: 200, headers: corsHeaders });
        }

        // 3. ESTORNO (Exige AMBOS event E status)
        if (event === 'TRANSACTION_REFUNDED' && transaction.status === 'REFUNDED') {
          const { data: refundRes, error: refundErr } = await sb.rpc('rpc_update_order_cancellation', {
            p_transaction_id: order.transaction_id,
            p_identifier: order.identifier,
            p_new_status: 'refunded',
            p_gateway_status: 'REFUNDED',
          });

          if (refundErr) {
            return new Response(JSON.stringify({ error: 'Erro ao estornar pedido.' }), { status: 500, headers: corsHeaders });
          }

          const refundRow = Array.isArray(refundRes) ? refundRes[0] : refundRes;
          if (!refundRow || !refundRow.success) {
            return new Response(JSON.stringify({ error: refundRow?.action || 'Estorno rejeitado.' }), { status: 400, headers: corsHeaders });
          }

          return new Response(JSON.stringify({ received: true, status: 'refunded' }), { status: 200, headers: corsHeaders });
        }

        // 4. CHARGEBACK (Exige AMBOS event E status)
        if (event === 'TRANSACTION_CHARGED_BACK' && transaction.status === 'CHARGED_BACK') {
          const { data: cbRes, error: cbErr } = await sb.rpc('rpc_update_order_cancellation', {
            p_transaction_id: order.transaction_id,
            p_identifier: order.identifier,
            p_new_status: 'charged_back',
            p_gateway_status: 'CHARGED_BACK',
          });

          if (cbErr) {
            return new Response(JSON.stringify({ error: 'Erro ao registrar chargeback.' }), { status: 500, headers: corsHeaders });
          }

          const cbRow = Array.isArray(cbRes) ? cbRes[0] : cbRes;
          if (!cbRow || !cbRow.success) {
            return new Response(JSON.stringify({ error: cbRow?.action || 'Chargeback rejeitado.' }), { status: 400, headers: corsHeaders });
          }

          return new Response(JSON.stringify({ received: true, status: 'charged_back' }), { status: 200, headers: corsHeaders });
        }

        // 5. EVENTO INTERMEDIÁRIO CREATED (Apenas se estiver em creating ou pending)
        if (event === 'TRANSACTION_CREATED' && ['creating', 'pending'].includes(order.status)) {
          return new Response(
            JSON.stringify({ received: true, status: 'created_acknowledged' }),
            { status: 200, headers: corsHeaders }
          );
        }

        return new Response(
          JSON.stringify({ error: 'Evento ou status não reconhecido.' }),
          { status: 400, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Rota não encontrada.' }),
        { status: 404, headers: corsHeaders }
      );
    } catch {
      return new Response(
        JSON.stringify({ error: 'Erro interno no servidor.' }),
        { status: 500, headers: corsHeaders }
      );
    }
  };
}

export default { fetch: createCheckoutHandler() };
