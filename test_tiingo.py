"""
Tiingo API 테스트 스크립트
- API 키가 작동하는지 확인
- 지원되는 심볼 확인
"""

import sqlite3
import requests
import sys
from pathlib import Path

# DB 경로 (Tauri 앱 데이터)
DB_PATH = (
    Path.home()
    / "AppData"
    / "Roaming"
    / "com.yun.investment-analyzer"
    / "indicators.db"
)

# 테스트할 Tiingo 심볼들
TEST_SYMBOLS = [
    ("spy", "S&P 500 ETF"),
    ("qqq", "Nasdaq 100 ETF"),
    ("gld", "Gold ETF"),
    ("slv", "Silver ETF"),
    ("ief", "7-10 Year Treasury ETF"),
    ("hyg", "High Yield Bond ETF"),
    ("vixy", "VIX Short-Term Futures ETF"),  # VIX 대체
    ("uvxy", "ProShares Ultra VIX"),
    ("btcusd", "Bitcoin"),
    ("vxn", "VXN (Nasdaq Volatility)"),  # 추가 테스트
    ("skew", "SKEW Index"),  # 추가 테스트
    ("eem", "Emerging Markets ETF"),  # Korea proxy 테스트
    ("ewz", "Brazil ETF"),
]


def get_tiingo_api_key():
    """DB에서 Tiingo API 키 가져오기"""
    if not DB_PATH.exists():
        print(f"❌ DB not found: {DB_PATH}")
        return None

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key = 'TIINGO_API_KEY'")
    row = cursor.fetchone()
    conn.close()

    if row and row[0]:
        return row[0]
    return None


def test_tiingo_symbol(api_key: str, symbol: str, name: str):
    """Tiingo API로 심볼 테스트"""
    url = f"https://api.tiingo.com/tiingo/daily/{symbol}/prices"
    headers = {"Authorization": f"Token {api_key}", "Content-Type": "application/json"}

    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data and len(data) > 0:
                latest = data[-1]
                print(
                    f"✅ {symbol:8} | {name:30} | Latest: ${latest.get('close', 'N/A'):.2f} on {latest.get('date', 'N/A')[:10]}"
                )
                return True
            else:
                print(f"⚠️  {symbol:8} | {name:30} | Empty response")
                return False
        elif resp.status_code == 404:
            print(f"❌ {symbol:8} | {name:30} | NOT FOUND on Tiingo")
            return False
        elif resp.status_code == 401:
            print(f"🔐 {symbol:8} | {name:30} | Unauthorized (bad API key?)")
            return False
        else:
            print(f"❓ {symbol:8} | {name:30} | HTTP {resp.status_code}")
            return False
    except Exception as e:
        print(f"💥 {symbol:8} | {name:30} | Error: {e}")
        return False


def main():
    print("=" * 70)
    print("🔍 Tiingo API 심볼 테스트")
    print("=" * 70)

    # 1. API 키 확인
    api_key = get_tiingo_api_key()
    if not api_key:
        print("\n❌ Tiingo API 키가 설정되지 않았어요!")
        print("   Settings > Data Sources > Tiingo API Key에서 설정해주세요.")
        return

    print(f"\n✅ Tiingo API 키 발견 (길이: {len(api_key)})")
    print("-" * 70)

    # 2. 심볼 테스트
    success_count = 0
    fail_count = 0

    for symbol, name in TEST_SYMBOLS:
        if test_tiingo_symbol(api_key, symbol, name):
            success_count += 1
        else:
            fail_count += 1

    print("-" * 70)
    print(f"\n📊 결과: {success_count} 성공, {fail_count} 실패")

    if fail_count > 0:
        print("\n⚠️  실패한 심볼들은 registry.rs에서 수정이 필요해요!")


if __name__ == "__main__":
    main()
