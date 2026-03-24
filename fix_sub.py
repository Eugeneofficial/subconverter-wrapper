"""
Fix proxy for MetaCubeX/subconverter VLESS parsing bug.

MetaCubeX/subconverter unconditionally calls urlSafeBase64Decode() on
subscription content loaded via URL, which corrupts plain-text VLESS links.

This proxy:
1. Fetches the subscription from the original URL
2. Base64-encodes the content
3. Saves it as a local file
4. Passes the local file path to subconverter (which then decodes correctly)

Usage:
    python fix_sub.py
    # Then use http://127.0.0.1:25501/sub?target=clash&url=YOUR_URL
"""

import base64
import http.server
import urllib.request
import urllib.parse
import ssl
import os
import hashlib
import sys
import tempfile

SUBCONVERTER_HOST = "127.0.0.1"
SUBCONVERTER_PORT = 25500
LISTEN_PORT = 25501

CACHE_DIR = os.path.join(tempfile.gettempdir(), "sub_fix_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

def fetch_and_encode(url):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    })
    with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
        raw = resp.read()
    encoded = base64.urlsafe_b64encode(raw).decode()
    fname = "sub_" + hashlib.md5(url.encode()).hexdigest()[:12] + ".txt"
    fpath = os.path.join(CACHE_DIR, fname)
    with open(fpath, "w", encoding="utf-8") as f:
        f.write(encoded)
    return fpath

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        sub_url = params.get("url", [None])[0]
        target = params.get("target", ["clash"])[0]

        if sub_url and parsed.path == "/sub":
            try:
                urls = sub_url.split("|")
                local_paths = []
                for u in urls:
                    u = u.strip()
                    if not u:
                        continue
                    local_paths.append(fetch_and_encode(u))

                joined = "|".join(local_paths)
                query = urllib.parse.urlencode({"target": target, "url": joined})
                upstream = "http://%s:%d/sub?%s" % (SUBCONVERTER_HOST, SUBCONVERTER_PORT, query)
                req2 = urllib.request.Request(upstream)
                with urllib.request.urlopen(req2, timeout=60) as resp2:
                    body = resp2.read()

                self.send_response(200)
                ct = resp2.headers.get("Content-Type", "text/yaml")
                self.send_header("Content-Type", ct)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                sys.stderr.write("OK: %d urls -> %d bytes\n" % (len(urls), len(body)))
                return
            except Exception as e:
                self.send_response(502)
                msg = str(e).encode("utf-8", errors="replace")
                self.send_header("Content-Type", "text/plain")
                self.send_header("Content-Length", str(len(msg)))
                self.end_headers()
                self.wfile.write(msg)
                sys.stderr.write("ERR: %s\n" % e)
                return

        upstream = "http://%s:%d%s" % (SUBCONVERTER_HOST, SUBCONVERTER_PORT, self.path)
        try:
            req = urllib.request.Request(upstream)
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read()
            self.send_response(200)
            self.send_header("Content-Type", resp.headers.get("Content-Type", "text/plain"))
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(str(e).encode("utf-8", errors="replace"))

if __name__ == "__main__":
    sys.stderr.write("=== VLESS Fix Proxy ===\n")
    sys.stderr.write("Listening: 0.0.0.0:%d\n" % LISTEN_PORT)
    sys.stderr.write("Subconverter: %s:%d\n" % (SUBCONVERTER_HOST, SUBCONVERTER_PORT))
    sys.stderr.write("Cache: %s\n\n" % CACHE_DIR)
    srv = http.server.HTTPServer(("0.0.0.0", LISTEN_PORT), Handler)
    srv.serve_forever()
