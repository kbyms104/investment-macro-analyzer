import requests
import re

url = "https://edition.cnn.com/markets/fear-and-greed"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

try:
    print("Fetching URL...")
    resp = requests.get(url, headers=headers)
    print(f"Status: {resp.status_code}")
    
    html = resp.text
    
    # 1. Search for current score
    score_match = re.search(r'"score":\s*([\d\.]+)', html)
    if score_match:
        print(f"✅ Found Score: {score_match.group(1)}")
    else:
        print("❌ Score NOT found (maybe logic relies on API fetch via JS?)")

    # 2. Search for historical data
    hist_match = re.search(r'fear_and_greed_historical', html)
    if hist_match:
        print("✅ Found 'fear_and_greed_historical' key in HTML!")
    else:
        print("❌ 'fear_and_greed_historical' key NOT found")
        
    # 3. Check for specific React/Next.js hydration data
    if "window.__DATA__" in html or "__NEXT_DATA__" in html:
        print("✅ Found Hydration Data pattern")
    else:
        print("❌ Hydration Data pattern not found")

except Exception as e:
    print(f"Error: {e}")
