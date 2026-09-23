const http = require('http');
const httpProxy = require('http-proxy');
const { WebSocket, WebSocketServer } = require('ws');

// Configuration
const PORT = 3000;
const TARGETS = {
  next: process.env.TARGET_NEXT || 'http://127.0.0.1:3001',
  supabase: process.env.TARGET_SUPABASE || 'http://127.0.0.1:54321',
  emotion: process.env.TARGET_EMOTION || 'http://127.0.0.1:8090',
  resume: process.env.TARGET_RESUME || 'http://127.0.0.1:8091',
  relay_google: process.env.TARGET_RELAY_GOOGLE || 'http://127.0.0.1:8082',
  relay_voice: process.env.TARGET_RELAY_VOICE || 'http://127.0.0.1:8081',
};

const VIDU_LIVE_HOST = (process.env.VIDU_LIVE_HOST || 'api.vidu.com').trim();
const VIDU_API_KEY = (process.env.VIDU_API_KEY || '').trim();

const proxy = httpProxy.createProxyServer({
  proxyTimeout: 600000,
  timeout: 600000,
});

// Long-lived proxy for resume scoring (LLM calls can be slow)
const resumeProxy = httpProxy.createProxyServer({
  proxyTimeout: 600000,  // 10 minutes
  timeout: 600000,
});

// Error handling
proxy.on('error', (err, req, res) => {
  console.error('[Gateway Error]', err.message);
  if (res.writeHead) {
    res.writeHead(502, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Kimiyi AI - Service Connectivity</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fafafa; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: white; padding: 2rem; border-radius: 1rem; shadow: 0 10px 25px rgba(0,0,0,0.05); max-width: 400px; text-align: center; border: 1px solid #eaeaea; }
          .icon { width: 64px; height: 64px; background: #fff3f3; color: #ff4d4d; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem; font-size: 32px; }
          h1 { font-size: 1.5rem; color: #1a1a1a; margin-bottom: 0.5rem; }
          p { color: #666; line-height: 1.5; margin-bottom: 1.5rem; }
          .btn { background: #1a1a1a; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 600; cursor: pointer; text-decoration: none; }
          .meta { font-size: 0.8rem; color: #999; margin-top: 1.5rem; border-top: 1px solid #eee; padding-top: 1rem; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">⚠️</div>
          <h1>Service Initializing</h1>
          <p>The Kimiyi AI services are currently starting up or experiencing a brief interruption. Please wait a few seconds and try refreshing.</p>
          <a href="javascript:location.reload()" class="btn">Refresh Page</a>
          <div class="meta">
            <div>common.status: Operational</div>
            <div>onboarding.integrityProtection: System Integrity Protection Enabled</div>
          </div>
        </div>
      </body>
      </html>
    `);
  }
});

resumeProxy.on('error', (err, req, res) => {
  console.error('[Gateway Resume Error]', err.message);
  if (res.writeHead) {
    res.writeHead(504, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Resume scoring timed out. Please try again.' }));
  }
});

const server = http.createServer((req, res) => {
  const url = req.url || '';

  if (url.startsWith('/_supabase')) {
    req.url = url.replace('/_supabase', '');
    proxy.web(req, res, { target: TARGETS.supabase });
  } else if (url.startsWith('/_emotion')) {
    req.url = url.replace('/_emotion', '');
    proxy.web(req, res, { target: TARGETS.emotion });
  } else if (url.startsWith('/_resume')) {
    req.url = url.replace('/_resume', '');
    resumeProxy.web(req, res, { target: TARGETS.resume });
  } else {
    // Default to Next.js
    proxy.web(req, res, { target: TARGETS.next });
  }
});

/**
 * Vidu Live WebSocket proxy.
 * Public docs claim query-string auth works in browsers — it does NOT (401).
 * Auth must be `Authorization: Token …` header, so we bridge:
 *   Browser  ↔  /_vidu/live/ws?live_id=…  ↔  wss://api.vidu.com/... (with header)
 */
const viduWss = new WebSocketServer({ noServer: true });

function bridgeViduLiveWs(clientWs, liveId) {
  if (!VIDU_API_KEY) {
    console.error('[Gateway] VIDU_API_KEY missing — cannot proxy Vidu live WS');
    clientWs.close(1011, 'Vidu not configured');
    return;
  }

  const upstreamUrl =
    `wss://${VIDU_LIVE_HOST}/live/ws/live/connect` +
    `?live_id=${encodeURIComponent(liveId)}`;

  console.log('[Gateway] Bridging Vidu live WS', { liveId, host: VIDU_LIVE_HOST });

  // The browser socket becomes open before the upstream Vidu socket. It sends
  // conn_init immediately, so buffer it rather than silently dropping it while
  // the upstream handshake is still in progress.
  const pendingClientMessages = [];
  const upstream = new WebSocket(upstreamUrl, {
    headers: { Authorization: `Token ${VIDU_API_KEY}` },
  });
  // Vidu (or the edge in front of it) closes an otherwise-idle control socket
  // after ~60 seconds. RTC video may remain visible, but the agent cannot
  // process further turns. Keep the control transport alive independently of
  // media, which flows through AliRTC.
  let keepAlive = null;
  const clearKeepAlive = () => {
    if (keepAlive) {
      clearInterval(keepAlive);
      keepAlive = null;
    }
  };

  const closeBoth = (code = 1000, reason = 'closed') => {
    try {
      if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
        clientWs.close(code, reason);
      }
    } catch { /* noop */ }
    try {
      if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
        upstream.close(code, reason);
      }
    } catch { /* noop */ }
  };

  upstream.on('open', () => {
    console.log('[Gateway] Vidu upstream open', {
      liveId,
      pendingMessages: pendingClientMessages.length,
    });
    for (const { data, isBinary } of pendingClientMessages.splice(0)) {
      upstream.send(data, { binary: isBinary });
    }
    keepAlive = setInterval(() => {
      if (upstream.readyState !== WebSocket.OPEN) return;
      try {
        upstream.ping();
        console.log('[Gateway] Vidu upstream keepalive ping', { liveId });
      } catch (err) {
        console.error('[Gateway] Vidu upstream keepalive failed', {
          liveId,
          error: err.message,
        });
      }
    }, 25_000);
  });

  upstream.on('message', (data, isBinary) => {
    console.log('[Gateway] Vidu upstream message', {
      liveId,
      bytes: data.length,
      preview: isBinary ? '<binary>' : String(data).slice(0, 500),
    });
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: !!isBinary });
    }
  });

  upstream.on('ping', (data) => {
    // Keep upstream alive; ws does not always auto-pong when we need reliability
    try { upstream.pong(data); } catch { /* noop */ }
  });

  upstream.on('close', (code, reason) => {
    clearKeepAlive();
    console.log('[Gateway] Vidu upstream close', { liveId, code, reason: String(reason) });
    closeBoth(code || 1000, reason?.toString?.() || 'upstream closed');
  });

  upstream.on('error', (err) => {
    clearKeepAlive();
    console.error('[Gateway] Vidu upstream error', err.message);
    closeBoth(1011, 'upstream error');
  });

  clientWs.on('message', (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) {
      console.log('[Gateway] Vidu client message forwarded', {
        liveId,
        bytes: data.length,
        preview: isBinary ? '<binary>' : String(data).slice(0, 500),
      });
      upstream.send(data, { binary: !!isBinary });
    } else if (upstream.readyState === WebSocket.CONNECTING) {
      console.log('[Gateway] Vidu client message buffered', {
        liveId,
        bytes: data.length,
        pendingMessages: pendingClientMessages.length + 1,
      });
      pendingClientMessages.push({ data, isBinary: !!isBinary });
    } else {
      console.error('[Gateway] Vidu client message dropped: upstream unavailable', {
        liveId,
        upstreamState: upstream.readyState,
      });
    }
  });

  clientWs.on('close', () => {
    clearKeepAlive();
    closeBoth();
  });

  clientWs.on('error', (err) => {
    clearKeepAlive();
    console.error('[Gateway] Vidu client WS error', err.message);
    closeBoth(1011, 'client error');
  });
}

// Handle WebSocket upgrades
server.on('upgrade', (req, socket, head) => {
  const url = req.url || '';
  console.log('[Gateway] WebSocket upgrade request:', url);

  if (url.startsWith('/_vidu/live/ws')) {
    let liveId = '';
    try {
      liveId = new URL(url, 'http://gateway.local').searchParams.get('live_id') || '';
    } catch { /* noop */ }
    if (!liveId) {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    viduWss.handleUpgrade(req, socket, head, (clientWs) => {
      bridgeViduLiveWs(clientWs, liveId);
    });
    return;
  }

  if (url.includes('google') || url.includes('8082')) {
    proxy.ws(req, socket, head, { target: TARGETS.relay_google.replace('http', 'ws') });
  } else if (url.includes('voice') || url.includes('8081')) {
    proxy.ws(req, socket, head, { target: TARGETS.relay_voice.replace('http', 'ws') });
  } else {
    // Forward HMR (Hot Module Replacement) to Next.js
    proxy.ws(req, socket, head, { target: TARGETS.next.replace('http', 'ws') });
  }
});

server.listen(PORT, () => {
  console.log(`\x1b[32m%s\x1b[0m`, `[Kimiyi Gateway] Running on http://0.0.0.0:${PORT}`);
  console.log(`[Kimiyi Gateway] Proxying all services through this single port.`);
  console.log(`[Kimiyi Gateway] Vidu live WS proxy: ${VIDU_API_KEY ? 'enabled' : 'DISABLED (no VIDU_API_KEY)'}`);
});
