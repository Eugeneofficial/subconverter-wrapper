import http.server
import urllib.request
import urllib.parse
import ssl
import os
import sys

PROXY_HOST = "127.0.0.1"
PROXY_PORT = 25501
LISTEN_PORT = 25502

WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "webui")

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/sub":
            try:
                params = urllib.parse.parse_qs(parsed.query)
                target = params.get("target", ["clash"])[0]
                sub_url = params.get("url", [""])[0]

                if not sub_url:
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(b"Missing url parameter")
                    return

                upstream = "http://%s:%d/sub?%s" % (
                    PROXY_HOST, PROXY_PORT,
                    urllib.parse.urlencode({"target": target, "url": sub_url})
                )
                req = urllib.request.Request(upstream)
                with urllib.request.urlopen(req, timeout=60) as resp:
                    body = resp.read()
                self.send_response(200)
                ct = resp.headers.get("Content-Type", "text/yaml")
                self.send_header("Content-Type", ct)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(body)
            except Exception as e:
                self.send_response(502)
                msg = str(e).encode("utf-8", errors="replace")
                self.send_header("Content-Type", "text/plain")
                self.send_header("Content-Length", str(len(msg)))
                self.end_headers()
                self.wfile.write(msg)
            return

        if parsed.path == "/api/status":
            try:
                upstream = "http://%s:%d/sub?%s" % (
                    PROXY_HOST, PROXY_PORT,
                    urllib.parse.urlencode({"target": "clash", "url": "data:text/plain,test"})
                )
                req = urllib.request.Request(upstream)
                with urllib.request.urlopen(req, timeout=3) as resp:
                    resp.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')
            except:
                self.send_response(503)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"status":"down"}')
            return

        super().do_GET()

if __name__ == "__main__":
    sys.stderr.write("=== SubConverter Web UI ===\n")
    sys.stderr.write("Listening: http://0.0.0.0:%d\n" % LISTEN_PORT)
    sys.stderr.write("Proxy:     http://%s:%d\n\n" % (PROXY_HOST, PROXY_PORT))
    srv = http.server.HTTPServer(("0.0.0.0", LISTEN_PORT), Handler)
    srv.serve_forever()
