#!/usr/bin/env python3
"""
Download Lab B01 screenshots from Notion.
Run this script from the img/lab01/ directory.

Usage:
  python3 download_from_notion.py

Requirements: pip install requests (or use urllib which is built-in)
"""
import urllib.request
import os
import sys

# Notion page ID for Environment & Chatbot — Lab B01
# The script fetches the page, extracts image URLs, and downloads them.
# Since Notion S3 URLs are time-limited, you may need to re-run if they expire.

# If you have the URLs already, paste them below.
# Otherwise, open the Notion page in your browser, right-click each image -> "Copy image address"

IMAGES = {
    "ollama-install-1.png": "PASTE_URL_HERE",
    "ollama-install-2.png": "PASTE_URL_HERE",
    "ollama-install-3.png": "PASTE_URL_HERE",
    "model-download-1.png": "PASTE_URL_HERE",
    "model-download-2.png": "PASTE_URL_HERE",
    "model-download-3.png": "PASTE_URL_HERE",
    "model-download-4.png": "PASTE_URL_HERE",
    "model-list.png": "PASTE_URL_HERE",
    "ollama-test-1.png": "PASTE_URL_HERE",
    "ollama-test-2.png": "PASTE_URL_HERE",
    "pip-install-1.png": "PASTE_URL_HERE",
    "pip-install-2.png": "PASTE_URL_HERE",
    "scaffold-1.png": "PASTE_URL_HERE",
    "scaffold-2.png": "PASTE_URL_HERE",
    "config-py.png": "PASTE_URL_HERE",
    "chatbot-test-1.png": "PASTE_URL_HERE",
    "chatbot-test-2.png": "PASTE_URL_HERE",
}

# ── Alternative: Just save screenshots manually ──
# 1. Open your Notion page: Environment & Chatbot — Lab B01
# 2. Right-click each screenshot → Save Image As...
# 3. Save with the filenames listed above into this directory
#
# Screenshot order on the Notion page:
#   Installing Ollama:    ollama-install-1, ollama-install-2, ollama-install-3
#   Downloading Models:   model-download-1, model-download-2, model-download-3, model-download-4
#   Listing Models:       model-list
#   Testing Ollama:       ollama-test-1, ollama-test-2
#   Python Environment:   pip-install-1, pip-install-2
#   Project Scaffold:     scaffold-1, scaffold-2
#   config.py:            config-py
#   Chatbot Test:         chatbot-test-1, chatbot-test-2

def download_all():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    for filename, url in IMAGES.items():
        if url == "PASTE_URL_HERE":
            print(f"  SKIP  {filename} — no URL provided")
            continue
        print(f"  GET   {filename}...", end=" ", flush=True)
        try:
            urllib.request.urlretrieve(url, filename)
            size = os.path.getsize(filename)
            print(f"OK ({size:,} bytes)")
        except Exception as e:
            print(f"FAIL ({e})")

    # Check results
    expected = list(IMAGES.keys())
    found = [f for f in expected if os.path.isfile(f) and os.path.getsize(f) > 1000]
    print(f"\n  {len(found)}/{len(expected)} screenshots downloaded")

    missing = [f for f in expected if f not in found]
    if missing:
        print("  Missing:", ", ".join(missing))

if __name__ == "__main__":
    download_all()
