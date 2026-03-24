/**
 * SubConverter VLESS Fix Proxy - Cloudflare Worker (ES Modules)
 *
 * Deploy: https://workers.cloudflare.com/
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    const cors = { 'Access-Control-Allow-Origin': '*' };

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'subconverter-wrapper' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/sub') {
      const subUrl = url.searchParams.get('url');
      const target = url.searchParams.get('target') || 'clash';

      if (!subUrl) {
        return new Response('Missing url parameter', { status: 400, headers: cors });
      }

      try {
        const urls = subUrl.split('|').filter(u => u.trim());
        let allNodes = [];

        for (const u of urls) {
          const nodes = await fetchAndParse(u.trim());
          allNodes = allNodes.concat(nodes);
        }

        if (allNodes.length === 0) {
          return new Response('No valid nodes found', { status: 404, headers: cors });
        }

        const output = generateClashYAML(allNodes);

        return new Response(output, {
          headers: {
            ...cors,
            'Content-Type': 'text/yaml; charset=utf-8',
            'X-Node-Count': String(allNodes.length),
          },
        });
      } catch (e) {
        return new Response('Error: ' + e.message, { status: 502, headers: cors });
      }
    }

    return new Response('Not found', { status: 404, headers: cors });
  },
};

async function fetchAndParse(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  let content = await resp.text();
  const nodes = [];

  const lines = content.split('\n').map(l => l.trim()).filter(l => l);
  const hasProtocol = lines.some(l => /^(vless|vmess|ss|ssr|trojan):\/\//i.test(l));

  if (!hasProtocol) {
    try { content = atob(content.replace(/-/g, '+').replace(/_/g, '/')); } catch (e) {}
  }

  const allLines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  for (const line of allLines) {
    try {
      if (line.startsWith('vless://')) nodes.push(parseVLESS(line));
      else if (line.startsWith('vmess://')) nodes.push(parseVMess(line));
      else if (line.startsWith('ss://')) nodes.push(parseSS(line));
      else if (line.startsWith('ssr://')) nodes.push(parseSSR(line));
      else if (line.startsWith('trojan://')) nodes.push(parseTrojan(line));
    } catch (e) {}
  }

  return nodes.filter(n => n);
}

function parseVLESS(link) {
  const parsed = new URL(link);
  const params = parsed.searchParams;
  const remark = decodeURIComponent(parsed.hash ? parsed.hash.slice(1) : '') || parsed.hostname;
  const uuid = decodeURIComponent(parsed.username);
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
    name: remark, type: 'vless', server, port, uuid, udp: true,
    tls: security === 'tls' || security === 'reality',
    'client-fingerprint': fp, servername: sni || server,
  };

  if (net !== 'tcp') node.network = net;
  if (security === 'reality' && pbk) {
    node['reality-opts'] = { 'public-key': pbk };
    if (sid) node['reality-opts']['short-id'] = sid;
  }
  if (flow) node.flow = flow;

  if (net === 'ws') {
    node['ws-opts'] = { path: path || '/' };
    if (host) node['ws-opts'].headers = { Host: host };
  } else if (net === 'grpc') {
    node['grpc-opts'] = { 'grpc-service-name': serviceName || path || '', 'grpc-mode': mode || 'gun' };
    if (host) node.servername = host;
  } else if (net === 'http') {
    node['http-opts'] = { path: [path || '/'] };
    if (host) node['http-opts'].headers = { Host: [host] };
  }

  return node;
}

function parseVMess(link) {
  const json = JSON.parse(atob(link.replace('vmess://', '')));
  const node = {
    name: json.ps || json.add + ':' + json.port,
    type: 'vmess', server: json.add, port: parseInt(json.port),
    uuid: json.id, alterId: parseInt(json.aid) || 0,
    cipher: json.scy || 'auto', udp: true,
    tls: json.tls === 'tls', servername: json.sni || json.host || json.add,
  };
  if (json.net) node.network = json.net;
  if (json.net === 'ws') {
    node['ws-opts'] = { path: json.path || '/' };
    if (json.host) node['ws-opts'].headers = { Host: json.host };
  } else if (json.net === 'grpc') {
    node['grpc-opts'] = { 'grpc-service-name': json.path || '', 'grpc-mode': json.type || 'gun' };
  } else if (json.net === 'http' || json.net === 'h2') {
    const key = json.net === 'h2' ? 'h2-opts' : 'http-opts';
    node[key] = { path: json.path || '/' };
    if (json.host) node[key].headers = { Host: json.host };
  }
  return node;
}

function parseSS(link) {
  const parsed = new URL(link);
  const remark = decodeURIComponent(parsed.hash ? parsed.hash.slice(1) : '') || parsed.hostname;
  let method, password, server, port;
  if (parsed.username) {
    const userinfo = atob(parsed.username);
    [method, password] = userinfo.split(':');
    server = parsed.hostname; port = parseInt(parsed.port);
  } else {
    const decoded = atob(link.replace('ss://', '').split('#')[0]);
    const m = decoded.match(/^(.+?):(.+)@(.+):(\d+)$/);
    if (!m) return null;
    [, method, password, server, port] = m; port = parseInt(port);
  }
  return { name: remark, type: 'ss', server, port, cipher: method, password, udp: true };
}

function parseSSR(link) {
  const decoded = atob(link.replace('ssr://', ''));
  const main = decoded.split('/?')[0];
  const params = decoded.split('/?')[1] || '';
  const parts = main.split(':');
  if (parts.length < 6) return null;
  const [server, , protocol, method, obfs] = parts;
  const port = parseInt(parts[1]);
  const password = atob(parts[5]);
  let remark = server + ':' + port;
  if (params) {
    const m = params.match(/remarks=([^&]+)/);
    if (m) try { remark = atob(m[1]); } catch (e) {}
  }
  return { name: remark, type: 'ssr', server, port, cipher: method, password, protocol, obfs, 'protocol-param': '', 'obfs-param': '', udp: true };
}

function parseTrojan(link) {
  const parsed = new URL(link);
  const remark = decodeURIComponent(parsed.hash ? parsed.hash.slice(1) : '') || parsed.hostname;
  const password = decodeURIComponent(parsed.username);
  const server = parsed.hostname;
  const port = parseInt(parsed.port) || 443;
  const params = parsed.searchParams;
  const node = { name: remark, type: 'trojan', server, port, password, udp: true, tls: true, sni: params.get('sni') || params.get('peer') || server };
  if (params.get('type') === 'ws') {
    node.network = 'ws';
    node['ws-opts'] = { path: params.get('path') || '/' };
    const host = params.get('host');
    if (host) node['ws-opts'].headers = { Host: host };
  }
  return node;
}

function generateClashYAML(nodes) {
  let y = 'port: 7890\nsocks-port: 7891\nallow-lan: true\nmode: Rule\nlog-level: info\nexternal-controller: :9090\n\nproxies:\n';
  for (const n of nodes) y += '  - ' + nodeToClash(n) + '\n';
  y += '\nrules:\n  - GEOIP,CN,DIRECT\n  - MATCH,Proxy\n';
  return y;
}

function nodeToClash(n) {
  const p = ['name: "' + esc(n.name) + '"', 'server: ' + n.server, 'port: ' + n.port, 'type: ' + n.type];
  if (n.uuid) p.push('uuid: ' + n.uuid);
  if (n.password) p.push('password: "' + esc(n.password) + '"');
  if (n.alterId !== undefined) p.push('alterId: ' + n.alterId);
  if (n.cipher) p.push('cipher: ' + n.cipher);
  if (n.protocol) p.push('protocol: ' + n.protocol);
  if (n.obfs) p.push('obfs: ' + n.obfs);
  if (n.tls) p.push('tls: true');
  if (n.udp) p.push('udp: true');
  if (n.servername) p.push('servername: ' + n.servername);
  if (n['client-fingerprint']) p.push('client-fingerprint: ' + n['client-fingerprint']);
  if (n.flow) p.push('flow: ' + n.flow);
  if (n.network) p.push('network: ' + n.network);
  if (n.sni) p.push('sni: ' + n.sni);
  if (n['reality-opts']) {
    const r = n['reality-opts'];
    let s = 'reality-opts: {public-key: ' + r['public-key'];
    if (r['short-id']) s += ', short-id: ' + r['short-id'];
    p.push(s + '}');
  }
  if (n['ws-opts']) {
    const w = n['ws-opts'];
    let s = 'ws-opts: {path: ' + w.path;
    if (w.headers?.Host) s += ', headers: {Host: "' + esc(w.headers.Host) + '"}';
    p.push(s + '}');
  }
  if (n['grpc-opts']) {
    const g = n['grpc-opts'];
    const gp = [];
    if (g['grpc-mode']) gp.push('grpc-mode: ' + g['grpc-mode']);
    if (g['grpc-service-name']) gp.push('grpc-service-name: "' + esc(g['grpc-service-name']) + '"');
    p.push('grpc-opts: {' + gp.join(', ') + '}');
  }
  if (n['http-opts']) {
    const h = n['http-opts'];
    const hp = [];
    if (h.path) hp.push('path: [' + h.path.map(v => '"' + esc(v) + '"').join(', ') + ']');
    if (h.headers?.Host) hp.push('headers: {Host: [' + h.headers.Host.map(v => '"' + esc(v) + '"').join(', ') + ']}');
    p.push('http-opts: {' + hp.join(', ') + '}');
  }
  if (n['h2-opts']) {
    const h2 = n['h2-opts'];
    const hp = [];
    if (h2.path) hp.push('path: "' + esc(h2.path) + '"');
    if (h2.host) hp.push('host: [' + h2.host.map(v => '"' + esc(v) + '"').join(', ') + ']');
    p.push('h2-opts: {' + hp.join(', ') + '}');
  }
  if (n['protocol-param']) p.push('protocol-param: "' + esc(n['protocol-param']) + '"');
  if (n['obfs-param']) p.push('obfs-param: "' + esc(n['obfs-param']) + '"');
  return '{' + p.join(', ') + '}';
}

function esc(s) { return s ? String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') : ''; }
