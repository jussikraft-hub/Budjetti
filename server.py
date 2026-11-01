#!/usr/bin/env python3
"""
Budjetti – Local Development & LAN Server with QR-Code for iPhone/iPad Testing
"""
import os
import sys
import socket
import subprocess
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 8089
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def get_wifi_ip():
    """Detect macOS Wi-Fi IP address (en0 / en1)"""
    for interface in ["en0", "en1"]:
        try:
            res = subprocess.run(["ipconfig", "getifaddr", interface], capture_output=True, text=True, check=True)
            ip = res.stdout.strip()
            if ip:
                return ip
        except Exception:
            pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def print_qr_banner(url):
    """Print ASCII banner and QR code for iPhone/iPad scanning"""
    print("\n" + "=" * 60)
    print("💳 BUDJETTI – MOBIILI- JA IPAD-TESTAUSPALVELIN KÄYNNISSÄ")
    print("=" * 60)
    print(f"\n📍 Paikallinen osoite (Mac):   http://localhost:{PORT}")
    print(f"📱 Lähiverkon osoite (iPhone): {url}")
    print("\n👉 Avaa iPhonella/iPadilla Safarissa ja valitse:")
    print("   Jaa (Share) ➔ 'Lisää Koti-valikkoon' (Add to Home Screen)")
    print("   ➔ Sovellus toimii koko ruudun PWA:na ilman selaimen kehyksiä!")
    print("-" * 60)
    
    # Yritetään tulostaa ASCII QR-koodi jos qrencode / python-qrcode on asennettu
    try:
        res = subprocess.run(["qrencode", "-t", "ANSIUTF8", url], capture_output=True, text=True)
        if res.returncode == 0:
            print("\n" + res.stdout)
    except Exception:
        pass
    print("=" * 60 + "\n")

class CustomHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=SCRIPT_DIR, **kwargs)

    def end_headers(self):
        # Lisätään välimuistiohjaimet kehitystä varten
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

if __name__ == "__main__":
    ip = get_wifi_ip()
    url = f"http://{ip}:{PORT}"
    print_qr_banner(url)
    
    server = HTTPServer(("0.0.0.0", PORT), CustomHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nPalvelin sammutettu.")
        sys.exit(0)
