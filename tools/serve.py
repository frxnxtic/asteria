#!/usr/bin/env python3
"""Dev-сервер Астерии с запретом кэширования (для живой разработки).

Использование: python3 tools/serve.py [порт]
"""
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f"АСТЕРИЯ: http://localhost:{port} (кэш выключен)")
    HTTPServer(("", port), NoCacheHandler).serve_forever()
