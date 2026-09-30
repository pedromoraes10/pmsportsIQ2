/**
 * Cloudflare Worker — Proxy para ogol.com.br
 *
 * Uso: GET https://seu-worker.workers.dev/?url=https://www.ogol.com.br/jogador/neymar/54814
 * Header obrigatório: X-Proxy-Token: <valor de PROXY_TOKEN>
 *
 * Deploy:
 *   1. Acesse https://workers.cloudflare.com e crie uma conta (gratuita)
 *   2. Crie um novo Worker e cole este código
 *   3. Anote a URL do Worker (ex: ogol-proxy.SEU-USUARIO.workers.dev)
 *   4. No Railway, adicione as variáveis PROXY_URL e PROXY_TOKEN
 */

// Token secreto — deve bater com PROXY_TOKEN no Railway.
// Lido do environment do Worker (configure em Settings > Variables no painel do Worker).
const getExpectedToken = (env) => env.PROXY_TOKEN || '';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'max-age=0',
};

export default {
  async fetch(request, env) {
    // Só aceita GET
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Valida token secreto
    const token = request.headers.get('X-Proxy-Token') || '';
    const expected = getExpectedToken(env);
    if (!expected || token !== expected) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Extrai a URL alvo do query param ?url=
    const incoming = new URL(request.url);
    const targetUrl = incoming.searchParams.get('url');

    if (!targetUrl) {
      return new Response('Missing ?url= parameter', { status: 400 });
    }

    // Só permite URLs do ogol para evitar uso indevido
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return new Response('Invalid URL', { status: 400 });
    }

    if (!parsed.hostname.endsWith('ogol.com.br')) {
      return new Response('Only ogol.com.br URLs are allowed', { status: 403 });
    }

    // Monta os headers: usa o Referer da requisição original se enviado
    const referer = request.headers.get('X-Target-Referer');
    const headers = {
      ...BROWSER_HEADERS,
      ...(referer ? { Referer: referer, 'Sec-Fetch-Site': 'same-origin' } : {}),
    };

    try {
      const response = await fetch(targetUrl, {
        headers,
        redirect: 'follow',
      });

      // Repassa o corpo e o content-type de volta para o Railway
      const body = await response.text();
      return new Response(body, {
        status: response.status,
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'text/html; charset=utf-8',
          'X-Proxied-Status': String(response.status),
        },
      });
    } catch (err) {
      return new Response(`Proxy error: ${err.message}`, { status: 502 });
    }
  },
};
