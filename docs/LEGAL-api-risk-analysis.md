# API 법적 리스크 분석 보고서

> **분석 일자:** 2026-02-12  
> **분석 범위:** Investment Macro Analyzer에서 사용 중인 모든 외부 데이터 소스의 상업적 판매 시 법적 위험 요소  
> **전제 조건:** FRED, Tiingo, Finnhub은 사용자 본인의 API 키를 입력하는 "도구 모델"로 구현되어 있음

---

## 📊 요약 (Executive Summary)

"사용자 API 키 모델"이 이미 적용되어 있어 FRED, Tiingo, Finnhub의 리스크가 크게 낮아졌습니다.
프로그램이 데이터를 "재배포"하는 것이 아니라, 사용자가 자신의 계정으로 데이터를 조회하는 **도구를 제공**하는 구조이기 때문입니다.

그러나 **Yahoo Finance와 multpl.com은 사용자 API 키 모델로도 해결 불가**합니다.

| 위험 등급 | API 수 | 해당 소스 |
|-----------|--------|-----------|
| 🔴 **Critical** | 2 | Yahoo Finance, multpl.com |
| 🟡 **Medium** | 1 | FRED (캐싱 조항) |
| 🟢 **Low** | 2 | Binance, feargreedmeter.com |
| ✅ **Safe** | 5 | Tiingo, Finnhub, Alternative.me, EIA, World Bank |

---

## 🔴 Critical — 즉시 조치 필요

### 1. Yahoo Finance (yahoo_finance_api 크레이트)

**사용처:** S&P 500, Gold, DXY 등 시장 가격 데이터  
**파일:** `src-tauri/src/fetcher/yahoo.rs`

**문제점:**
1. `yahoo_finance_api` 크레이트는 Yahoo가 공식 제공하는 API가 **아닙니다**. 비공식 엔드포인트를 리버스 엔지니어링한 라이브러리입니다.
2. **API 키 자체가 없음** — 사용자 키 모델을 적용할 수 없습니다. 인증 없이 비공식 엔드포인트에 접근합니다.
3. Yahoo ToS는 "automated data access or collection by any means, including robots, spiders, scrapers"를 **전면 금지**합니다.
4. 거래소(NYSE, NASDAQ) 라이선스 데이터를 무단으로 중계하는 것에 해당합니다.
5. **언제든 차단될 수 있으며**, 라이브러리 유지보수도 불안정합니다.

**법적 결과:** DMCA takedown, 소송 위험, API 접근 차단  
**필수 조치:** 다른 데이터 소스로 **교체 필수**

### 2. multpl.com (S&P 500 PE Ratio 스크래핑)

**사용처:** S&P 500 P/E Ratio (SP500PE12M)  
**파일:** `src-tauri/src/fetcher/alternative.rs` → `fetch_sp500_pe()`

**문제점:**
1. API가 없으므로 HTML을 직접 파싱(스크래핑)하여 데이터 추출
2. multpl.com ToS: "information provided through the service is to be used strictly for **personal purposes**"
3. 제3자 공개 금지: "not to use or disclose the information to any third party"

**법적 결과:** CFAA 위반 가능성, 접근 차단, 손해배상  
**필수 조치:** FRED의 PE10(CAPE Ratio) 시리즈 또는 유료 API로 교체

---

## 🟡 Medium — 주의 필요

### 3. FRED API (사용자 키 모델 적용됨)

**사용처:** 거시경제 지표 전체 (GDP, CPI, 금리, 실업률, M2 등)  
**파일:** `src-tauri/src/fetcher/fred.rs`

**사용자 API 키 모델 적용 → 재배포 리스크 해소됨 ✅**

사용자가 자신의 FRED API 키로 데이터를 조회하므로, 프로그램은 "도구"로 분류됩니다.

**잔여 리스크:**

| 항목 | 상세 | 위험도 |
|------|------|--------|
| 데이터 캐싱 | FRED ToS (2024.06 업데이트)는 "storing, caching, or archiving"을 금지. 현재 SQLite에 시계열 저장 중 | 🟡 Medium |
| AI/ML 사용 | FRED 데이터를 AI 리포트 생성에 사용 — 2024년 업데이트로 금지된 영역 | 🟡 Medium |

> **캐싱 문제:** 사용자 키 모델이더라도, FRED 데이터를 로컬 DB에 장기간 저장/캐싱하는 것은 ToS 위반일 수 있습니다.
> 단, 사용자 본인의 키로 본인의 로컬 환경에 저장하는 것이므로 **사용자 본인의 ToS 준수 책임**으로 해석될 여지도 있습니다.

**위험 완화 방안:**
- 앱 내 "FRED Terms of Use" 안내 및 동의 절차 추가
- 캐싱 데이터에 만료 기한 설정 (예: 30일 후 자동 삭제)
- AI 리포트에 FRED 원본 데이터 직접 포함 금지 (분석 결과만 사용)

---

## 🟢 Low — 경미한 리스크

### 4. Binance API

**사용처:** BTC 가격, Funding Rate, Open Interest, Long/Short Ratio  
**파일:** `src-tauri/src/fetcher/binance.rs`

**상태:** Klines 등 공개 API 사용. API 키는 선택적.
- 우리 앱은 "분석 도구"이지 "데이터 피드 서비스"가 아님
- Binance 데이터를 직접 재판매하지 않으므로 리스크 낮음
- 단, "trading services using Binance quotes" 금지 조항에 간접적으로 해당할 수 있음

### 5. feargreedmeter.com (CNN Fear & Greed 대체)

**사용처:** Fear & Greed Index  
**파일:** `src-tauri/src/fetcher/cnn.rs`

**상태:** 웹 스크래핑으로 데이터 수집. 명시적 ToS 확인 어려움.
- 스크래핑 의존성이 있어 언제든 차단될 수 있음
- 법적 위험보다 **안정성 위험**이 더 큼

---

## ✅ Safe — 사용자 키 모델로 안전

### 6. Tiingo API ✅

**사용처:** 주식, 암호화폐, FX 가격 데이터  
**파일:** `src-tauri/src/fetcher/tiingo.rs`

Tiingo Developer Program은 **사용자 본인의 API 토큰**을 요구하는 소프트웨어 모델을 명시적으로 인정합니다.

### 7. Finnhub API ✅

**사용처:** Earnings Calendar, IPO Calendar  
**파일:** `src-tauri/src/fetcher/calendar.rs`

사용자 본인의 Finnhub API 키를 사용하므로 재배포에 해당하지 않습니다.

### 8. Alternative.me ✅

**사용처:** Crypto Fear & Greed Index  
**조건:** "Data sourced by alternative.me" 귀속 표시 + 링크 필요  
**상태:** 상업적 사용 **명시적 허용**

### 9. EIA API ✅

**사용처:** 원유/천연가스 재고  
**조건:** 출처를 "U.S. Energy Information Administration"으로 표시  
**상태:** 미국 정부 공공 데이터, 상업적 사용 가능

### 10. World Bank API ✅

**사용처:** 글로벌 GDP 성장률  
**조건:** "The World Bank: [Dataset name]" 귀속 필요  
**상태:** CC-BY 4.0 라이선스, 상업적 사용 가능

---

## 📋 필수 조치 사항 (우선순위순)

| 우선순위 | 조치 | 난이도 |
|----------|------|:------:|
| **P0** | Yahoo Finance 제거 → Twelve Data, Alpha Vantage, 또는 Polygon.io로 교체 | 중 |
| **P0** | multpl.com 스크래핑 제거 → FRED PE10 시리즈로 교체 | 하 |
| **P1** | 투자 면책 조항(Disclaimer) 앱 전체에 추가 | 하 |
| **P1** | FRED 캐싱 정책 안내문 + 데이터 만료 정책 검토 | 하 |
| **P2** | Alternative.me, EIA, World Bank 귀속 표시 UI에 추가 | 하 |
| **P2** | feargreedmeter.com → Alternative.me로 통합 검토 | 하 |

## 대안 데이터 소스 검토

### Yahoo Finance 교체 후보

| 대안 | 가격 데이터 | 무료 티어 | 비용 (유료) | API 키 모델 호환 |
|------|------------|----------|------------|:---------------:|
| **Twelve Data** | 주식, FX, 암호화폐 | 800 req/일 | $29/월~ | ✅ |
| **Alpha Vantage** | 주식, FX, 암호화폐 | 25 req/일 | $49/월~ | ✅ |
| **Polygon.io** | 주식, FX, 암호화폐 | 5 req/분 | $29/월~ | ✅ |
| **EOD Historical Data** | 주식, ETF, 펀드 | 20 req/일 | $19.99/월~ | ✅ |

### multpl.com 교체

FRED에서 직접 제공하는 `PE10` (Shiller CAPE Ratio) 시리즈 사용. 이미 FRED 인프라가 구축되어 있으므로 별도 개발이 거의 필요 없습니다.
