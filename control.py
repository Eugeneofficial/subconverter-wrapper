import subprocess
import sys
import os
import time

MENU = """
============================================
  SubConverter Control Panel
============================================

  [1] Start all (SubConverter + Proxy + WebUI)
  [2] Copy URL to clipboard (BLACK VLESS)
  [3] Enter custom URL and copy
  [4] Open Web UI in browser
  [5] Stop everything
  [0] Exit

============================================
"""

BLACK_VLESS_URL = "https://raw.githubusercontent.com/igareck/vpn-configs-for-russia/refs/heads/main/BLACK_VLESS_RUS.txt"
PROXY_PORT = 25501
WEBUI_PORT = 25502

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def get_sub_url(sub_url):
    return f"http://127.0.0.1:{PROXY_PORT}/sub?target=clash&url={sub_url}"

def copy_to_clipboard(text):
    process = subprocess.Popen(['clip'], stdin=subprocess.PIPE, shell=True)
    process.communicate(input=text.encode('utf-8'))

def start_services():
    sc_path = os.path.join(SCRIPT_DIR, "subconverter.exe")
    fx_path = os.path.join(SCRIPT_DIR, "fix_sub.py")
    ui_path = os.path.join(SCRIPT_DIR, "webui_server.py")

    flag = subprocess.CREATE_NEW_CONSOLE

    subprocess.Popen([sc_path], cwd=SCRIPT_DIR, creationflags=flag)
    time.sleep(2)
    subprocess.Popen(["python", fx_path], cwd=SCRIPT_DIR, creationflags=flag)
    time.sleep(2)
    subprocess.Popen(["python", ui_path], cwd=SCRIPT_DIR, creationflags=flag)
    time.sleep(1)

    print()
    print("  All services started!")
    print(f"  SubConverter: http://127.0.0.1:25500")
    print(f"  Fix Proxy:    http://127.0.0.1:{PROXY_PORT}")
    print(f"  Web UI:       http://127.0.0.1:{WEBUI_PORT}")
    print()

def stop_services():
    subprocess.run(["taskkill", "/F", "/IM", "subconverter.exe"], capture_output=True)
    subprocess.run(["taskkill", "/F", "/IM", "python.exe"], capture_output=True)
    print("  All stopped.")
    print()

def open_browser():
    import webbrowser
    webbrowser.open(f"http://127.0.0.1:{WEBUI_PORT}")

def main():
    while True:
        os.system('cls')
        print(MENU)
        choice = input("  > ").strip()

        if choice == "1":
            start_services()
            input("  Press Enter...")
        elif choice == "2":
            url = get_sub_url(BLACK_VLESS_URL)
            copy_to_clipboard(url)
            print()
            print("  URL copied to clipboard!")
            print(f"  {url}")
            print()
            print("  Open Clash Verge Rev -> Profiles -> Paste (Ctrl+V)")
            print()
            input("  Press Enter...")
        elif choice == "3":
            print()
            sub = input("  Enter subscription URL: ").strip()
            url = get_sub_url(sub)
            copy_to_clipboard(url)
            print()
            print("  URL copied to clipboard!")
            print(f"  {url}")
            print()
            input("  Press Enter...")
        elif choice == "4":
            open_browser()
        elif choice == "5":
            stop_services()
            input("  Press Enter...")
        elif choice == "0":
            sys.exit(0)

if __name__ == "__main__":
    main()
