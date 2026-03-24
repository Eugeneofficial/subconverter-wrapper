/**
 * SubConverter VLESS Fix Proxy - Cloudflare Worker
 *
 * This worker:
 * 1. Accepts a subscription URL
 * 2. Fetches the subscription content
 * 3. Parses VLESS/VMess/SS/SSR/Trojan URLs
 * 4. Generates Clash YAML config
 * 5. Returns it directly (no subconverter binary needed!)
 *
 * Deploy to Cloudflare Workers (free tier):
 * https://workers.cloudflare.com/
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  // Health check
  if (url.pathname === '/' || url.pathname === '/health') {
    return new Response(JSON.stringify({ status: 'ok', service: 'subconverter-vless-fix' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Main endpoint: /sub?url=...&target=clash
  if (url.pathname === '/sub') {
    const subUrl = url.searchParams.get('url');
    const target = url.searchParams.get('target') || 'clash';

    if (!subUrl) {
      return errorResponse('Missing url parameter', 400);
    }

    try {
      // Split multiple URLs
      const urls = subUrl.split('|').filter(u => u.trim());
      let allNodes = [];

      for (const u of urls) {
        const nodes = await fetchAndParse(u.trim());
        allNodes = allNodes.concat(nodes);
      }

      if (allNodes.length === 0) {
        return errorResponse('No valid nodes found', 404);
      }

      // Generate output based on target
      let output;
      if (target.startsWith('clash')) {
        output = generateClashYAML(allNodes);
      } else {
        // Default to Clash
        output = generateClashYAML(allNodes);
      }

      return new Response(output, {
        headers: {
          'Content-Type': 'text/yaml; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'X-Node-Count': String(allNodes.length),
        },
      });
    } catch (e) {
      return errorResponse('Error: ' + e.message, 502);
    }
  }

  return errorResponse('Not found', 404);
}

async function fetchAndParse(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    cf: { timeout: 15000 },
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);

  let content = await resp.text();
  const nodes = [];

  // Check if base64 encoded
  const lines = content.split('\n').map(l => l.trim()).filter(l => l);
  const hasProtocol = lines.some(l => l.match(/^(vless|vmess|ss|ssr|trojan):\/\//i));

  if (!hasProtocol) {
    try {
      content = atob(content.replace(/-/g, '+').replace(/_/g, '/'));
    } catch (e) {
      // Already plain text, continue
    }
  }

  // Parse each line
  const allLines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  for (const line of allLines) {
    try {
      if (line.startsWith('vless://')) {
        nodes.push(parseVLESS(line));
      } else if (line.startsWith('vmess://')) {
        nodes.push(parseVMess(line));
      } else if (line.startsWith('ss://')) {
        nodes.push(parseSS(line));
      } else if (line.startsWith('ssr://')) {
        nodes.push(parseSSR(line));
      } else if (line.startsWith('trojan://')) {
        nodes.push(parseTrojan(line));
      }
    } catch (e) {
      // Skip invalid nodes
    }
  }

  return nodes.filter(n => n);
}

// ============== PARSERS ==============

function parseVLESS(link) {
  const parsed = new URL(link);
  const params = parsed.searchParams;

  const remark = decodeURIComponent(parsed.hash ? parsed.hash.slice(1) : '') || parsed.hostname;
  const uuid = parsed.username;
  const server = parsed.hostname;
  const port = parseInt(parsed.port) || 443;

  const net = params.get('type') || 'tcp';
  const security = params.get('security') || 'none';
  const sni = params.get('sni') || params.get('peer') || '';
  const fp = params.get('fp') || params.get('clientFingerprint') || 'random';
  const flow = params.get('flow') || '';
  const pbk = params.get('pbk') || '';
  const sid = params.get('sid') || '';
  const host = params.get('host') || '';
  const path = params.get('path') || '/';
  const mode = params.get('mode') || '';
  const serviceName = params.get('serviceName') || '';

  const node = {
    name: remark,
    type: 'vless',
    server,
    port,
    uuid,
    udp: true,
    tls: security === 'tls' || security === 'reality',
    'client-fingerprint': fp,
    servername: sni || server,
  };

  // Network type
  if (net !== 'tcp') {
    node.network = net;
  }

  // Reality
  if (security === 'reality' && pbk) {
    node['reality-opts'] = { 'public-key': pbk };
    if (sid) node['reality-opts']['short-id'] = sid;
  }

  // Flow
  if (flow) {
    node.flow = flow;
  }

  // Network-specific options
  if (net === 'ws') {
    node['ws-opts'] = { path: path || '/' };
    if (host) node['ws-opts'].headers = { Host: host };
  } else if (net === 'grpc') {
    node['grpc-opts'] = {
      'grpc-service-name': serviceName || path || '',
      'grpc-mode': mode || 'gun',
    };
    if (host) node.servername = host;
  } else if (net === 'http') {
    node['http-opts'] = { path: [path || '/'] };
    if (host) node['http-opts'].headers = { Host: [host] };
  }

  return node;
}

function parseVMess(link) {
  const b64 = link.replace('vmess://', '');
  const json = JSON.parse(atob(b64));

  return {
    name: json.ps || json.add + ':' + json.port,
    type: 'vmess',
    server: json.add,
    port: parseInt(json.port),
    uuid: json.id,
    alterId: parseInt(json.aid) || 0,
    cipher: json.scy || 'auto',
    udp: true,
    tls: json.tls === 'tls',
    servername: json.sni || json.host || json.add,
    network: json.net || 'tcp',
    'ws-opts': json.net === 'ws' ? {
      path: json.path || '/',
      headers: json.host ? { Host: json.host } : undefined,
    } : undefined,
  };
}

function parseSS(link) {
  const parsed = new URL(link);
  const remark = decodeURIComponent(parsed.hash ? parsed.hash.slice(1) : '') || parsed.hostname;

  let method, password, server, port;

  if (parsed.username) {
    // ss://method:password@server:port
    const userinfo = atob(parsed.username);
    [method, password] = userinfo.split(':');
    server = parsed.hostname;
    port = parseInt(parsed.port);
  } else {
    // ss://base64(method:password@server:port)
    const decoded = atob(link.replace('ss://', '').split('#')[0]);
    const match = decoded.match(/^(.+?):(.+)@(.+):(\d+)$/);
    if (!match) return null;
    [, method, password, server, port] = match;
    port = parseInt(port);
  }

  return {
    name: remark,
    type: 'ss',
    server,
    port,
    cipher: method,
    password,
    udp: true,
  };
}

function parseSSR(link) {
  // SSR format: ssr://base64(server:port:protocol:method:obfs:password/?params)
  const decoded = atob(link.replace('ssr://', ''));
  const mainPart = decoded.split('/?')[0];
  const paramsPart = decoded.split('/?')[1] || '';

  const parts = mainPart.split(':');
  if (parts.length < 6) return null;

  const server = parts[0];
  const port = parseInt(parts[1]);
  const protocol = parts[2];
  const method = parts[3];
  const obfs = parts[4];
  const password = atob(parts[5]);

  let remark = server + ':' + port;
  if (paramsPart) {
    const remarksMatch = paramsPart.match(/remarks=([^&]+)/);
    if (remarksMatch) {
      try { remark = atob(remarksMatch[1]); } catch (e) {}
    }
  }

  return {
    name: remark,
    type: 'ssr',
    server,
    port,
    cipher: method,
    password,
    protocol,
    obfs,
    'protocol-param': '',
    'obfs-param': '',
    udp: true,
  };
}

function parseTrojan(link) {
  const parsed = new URL(link);
  const remark = decodeURIComponent(parsed.hash ? parsed.hash.slice(1) : '') || parsed.hostname;
  const password = parsed.username;
  const server = parsed.hostname;
  const port = parseInt(parsed.port) || 443;
  const params = parsed.searchParams;

  const node = {
    name: remark,
    type: 'trojan',
    server,
    port,
    password,
    udp: true,
    tls: true,
    sni: params.get('sni') || params.get('peer') || server,
  };

  if (params.get('type') === 'ws') {
    node.network = 'ws';
    node['ws-opts'] = { path: params.get('path') || '/' };
    const host = params.get('host');
    if (host) node['ws-opts'].headers = { Host: host };
  }

  return node;
}

// ============== CLASH YAML GENERATOR ==============

function generateClashYAML(nodes) {
  let yaml = '';
  yaml += 'port: 7890\n';
  yaml += 'socks-port: 7891\n';
  yaml += 'allow-lan: true\n';
  yaml += 'mode: Rule\n';
  yaml += 'log-level: info\n';
  yaml += 'external-controller: :9090\n\n';
  yaml += 'proxies:\n';

  for (const node of nodes) {
    yaml += '  - ' + nodeToClash(node) + '\n';
  }

  // Add rules
  yaml += '\nrules:\n';
  yaml += '  - GEOIP,CN,DIRECT\n';
  yaml += '  - MATCH,🔰 节点选择\n';

  return yaml;
}

function nodeToClash(node) {
  const parts = [];

  parts.push('name: "' + escapeYAML(node.name) + '"');
  parts.push('server: ' + node.server);
  parts.push('port: ' + node.port);
  parts.push('type: ' + node.type);

  if (node.uuid) parts.push('uuid: ' + node.uuid);
  if (node.password) parts.push('password: "' + escapeYAML(node.password) + '"');
  if (node.alterId !== undefined) parts.push('alterId: ' + node.alterId);
  if (node.cipher) parts.push('cipher: ' + node.cipher);
  if (node.protocol) parts.push('protocol: ' + node.protocol);
  if (node.obfs) parts.push('obfs: ' + node.obfs);

  if (node.tls) parts.push('tls: true');
  if (node.udp) parts.push('udp: true');
  if (node.servername) parts.push('servername: ' + node.servername);
  if (node['client-fingerprint']) parts.push('client-fingerprint: ' + node['client-fingerprint']);
  if (node.flow) parts.push('flow: ' + node.flow);
  if (node.network) parts.push('network: ' + node.network);
  if (node.sni) parts.push('sni: ' + node.sni);

  if (node['reality-opts']) {
    const ro = node['reality-opts'];
    let roStr = 'reality-opts: {public-key: ' + ro['public-key'];
    if (ro['short-id']) roStr += ', short-id: ' + ro['short-id'];
    roStr += '}';
    parts.push(roStr);
  }

  if (node['ws-opts']) {
    const wo = node['ws-opts'];
    let woStr = 'ws-opts: {path: ' + wo.path;
    if (wo.headers && wo.headers.Host) woStr += ', headers: {Host: ' + wo.headers.Host + '}';
    woStr += '}';
    parts.push(woStr);
  }

  if (node['grpc-opts']) {
    const go = node['grpc-opts'];
    let goStr = 'grpc-opts: {';
    const gp = [];
    if (go['grpc-mode']) gp.push('grpc-mode: ' + go['grpc-mode']);
    if (go['grpc-service-name']) gp.push('grpc-service-name: ' + go['grpc-service-name']);
    goStr += gp.join(', ') + '}';
    parts.push(goStr);
  }

  if (node['http-opts']) {
    const ho = node['http-opts'];
    let hoStr = 'http-opts: {';
    const hp = [];
    if (ho.path) hp.push('path: [' + ho.path.join(', ') + ']');
    if (ho.headers && ho.headers.Host) hp.push('headers: {Host: [' + ho.headers.Host.join(', ') + ']}');
    hoStr += hp.join(', ') + '}';
    parts.push(hoStr);
  }

  if (node['protocol-param']) parts.push('protocol-param: "' + escapeYAML(node['protocol-param']) + '"');
  if (node['obfs-param']) parts.push('obfs-param: "' + escapeYAML(node['obfs-param']) + '"');

  return '{' + parts.join(', ') + '}';
}

function escapeYAML(str) {
  if (!str) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function errorResponse(msg, status) {
  return new Response(msg, {
    status,
    headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
  });
}
