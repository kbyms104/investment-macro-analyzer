# Investment Macro Analyzer

> 무료 오픈소스 거시경제 분석 및 시장 리스크 평가 데스크톱 애플리케이션. Rust + Tauri v2 + React 19로 제작.

[🇺🇸 English](./README.md) | 🇰🇷 한국어

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Rust](https://img.shields.io/badge/rust-1.75+-orange.svg)
![Tauri](https://img.shields.io/badge/tauri-v2-blue.svg)
![React](https://img.shields.io/badge/react-19-61dafb.svg)

---

## 개요

Investment Macro Analyzer는 여러 데이터 소스에서 **110개 이상의 거시경제 지표**를 수집하고, 통합된 **Market Risk Score (0-100)**를 제공하여 현재 시장 상황을 한눈에 파악할 수 있는 데스크톱 애플리케이션입니다.

> ⚠️ **면책 조항:** 이 도구는 **정보 제공 및 교육 목적**으로만 제공됩니다. 투자 조언에 해당하지 않습니다. 자세한 내용은 [DISCLAIMER.md](./DISCLAIMER.md)를 참고하세요.

## 📸 스크린샷

### 개요 — Market Risk Score & 핵심 지표
<p align="center">
  <img src="docs/screenshots/Overview1.png" width="80%" alt="Overview - Risk Score">
  <img src="docs/screenshots/Overview2.png" width="80%" alt="Overview - Key Indicators">
</p>

### 대시보드 & 지표 상세
<p align="center">
  <img src="docs/screenshots/dashboards.png" width="80%" alt="Dashboards">
  <img src="docs/screenshots/indicators.png" width="80%" alt="Indicators Detail">
</p>

### 시장 사이클 & 마켓 맵
<p align="center">
  <img src="docs/screenshots/marketcycle.png" width="49%" alt="Market Cycle">
  <img src="docs/screenshots/marketmap1.png" width="49%" alt="Market Map">
</p>

### 상관관계 분석
<p align="center">
  <img src="docs/screenshots/correlationlab1.png" width="49%" alt="Correlation Lab">
  <img src="docs/screenshots/correlationlab2_1.png" width="49%" alt="Correlation Analysis">
</p>

### AI 리포트 & 시장 캘린더
<p align="center">
  <img src="docs/screenshots/aireport.png" width="49%" alt="AI Report">
  <img src="docs/screenshots/marketcalendar.png" width="49%" alt="Market Calendar">
</p>

### 데이터 수집 & 설정
<p align="center">
  <img src="docs/screenshots/dataingestion.png" width="49%" alt="Data Ingestion">
  <img src="docs/screenshots/settings1.png" width="49%" alt="Settings">
</p>

---

## ✨ 주요 기능

### 📊 시장 개요 & Risk Score
- **Market Risk Score (0-100)** — 수익률 곡선, VIX, 유동성, 밸류에이션 신호를 종합한 복합 점수
- **시장 국면 감지** — 현재 환경을 자동 분류 (Goldilocks, Reflation, Stagflation, Recession)
- **액션 신호** — Risk-Off/On 알림, 수익률 곡선 경고, VIX 스파이크 등

### 📈 110개 이상의 경제 지표
- **카테고리:** 성장, 인플레이션, 고용, 주택, 통화, 심리, 변동성, 암호화폐, 원자재 등
- **인터랙티브 차트** — Lightweight Charts & Recharts 기반
- **Z-Score 분석** — 각 지표의 통계적 이상치 탐지

### 🧪 분석 도구
- **상관관계 분석 (Correlation Lab)** — 두 지표 간 교차 상관관계 분석
- **시장 사이클 뷰** — 수익률 곡선, 선행지표, 경기침체 확률
- **마켓 맵** — 지표 카테고리 트리맵 시각화
- **데이터 랩** — 원시 데이터 탐색 및 내보내기

### 🤖 AI 기반 분석
- **AI 시장 리포트** — Gemini/OpenAI를 활용한 종합 시장 분석 생성
- **프롬프트 엔지니어링** — 현재 지표 데이터로 동적 강화된 프롬프트

### 📅 시장 캘린더
- **실적 캘린더** — 예정된 실적 발표 일정
- **IPO 캘린더** — 신규 상장 추적

### 🌐 다국어 지원
- 영어 및 한국어 지원 (i18n)

---

## 🛠️ 기술 스택

| 레이어 | 기술 |
|--------|------|
| **백엔드** | Rust, Tauri v2 |
| **프론트엔드** | React 19, TypeScript, Vite |
| **데이터베이스** | SQLite (sqlx) |
| **스타일링** | Tailwind CSS, Framer Motion |
| **차트** | Lightweight Charts, Recharts, Nivo |
| **데이터 소스** | FRED, Tiingo, Finnhub, Binance, EIA, World Bank, Alternative.me |

---

## 🛠️ 보너스 도구: DB Admin 대시보드

로컬 SQLite 데이터베이스를 브라우저에서 직접 조회하고 시각화할 수 있는 **Streamlit 기반 웹 대시보드** (`dashboard.py`)가 포함되어 있습니다.

```bash
# 의존성 설치
pip install streamlit pandas plotly

# 대시보드 실행
streamlit run dashboard.py
```

---

## 🚀 빠른 시작

### 사전 요구사항

- [Rust](https://rustup.rs/) (1.75+)
- [Node.js](https://nodejs.org/) (18+)
- [Tauri v2 사전 요구사항](https://v2.tauri.app/start/prerequisites/)

### 설치

```bash
# 저장소 클론
git clone https://github.com/kbyms104/investment-macro-analyzer.git
cd investment-macro-analyzer

# 프론트엔드 의존성 설치
npm install

# 개발 모드 실행
npm run tauri dev
```

### 프로덕션 빌드

```bash
npm run tauri build
```

---

## 🔑 API 키 설정

이 애플리케이션은 **"Bring Your Own Key"** 모델을 사용합니다. 사용자가 직접 API 키를 제공하면 앱이 로컬 환경에서 직접 데이터를 가져옵니다. 중간 서버를 거치지 않습니다.

| API | 필수 여부 | 무료 티어 | 가입 |
|-----|:---------:|-----------|------|
| **FRED** | ✅ 필수 | 무제한 | [fred.stlouisfed.org](https://fred.stlouisfed.org/docs/api/api_key.html) |
| **Tiingo** | 선택 | 1,000 요청/일 | [api.tiingo.com](https://api.tiingo.com/) |
| **Finnhub** | 선택 | 60 요청/분 | [finnhub.io](https://finnhub.io/) |
| **EIA** | 선택 | 무제한 | [eia.gov/opendata](https://www.eia.gov/opendata/register.php) |

앱 실행 후 **설정(Settings)** 메뉴에서 API 키를 입력하세요.

> **FRED API 키는 필수**입니다 — GDP, CPI, 금리 등 핵심 거시경제 지표에 필요합니다. 나머지 키는 선택사항이며 추가 데이터 소스를 활성화합니다.

---

## 📂 프로젝트 구조

```
investment-macro-analyzer/
├── src/                    # React 프론트엔드
│   ├── components/
│   │   ├── views/          # 메인 뷰 (11개)
│   │   ├── modals/         # 설정, 알림
│   │   ├── layout/         # 앱 레이아웃, 사이드바
│   │   └── ui/             # 재사용 UI 컴포넌트
│   ├── i18n/               # 다국어 지원
│   └── App.tsx             # 메인 진입점
├── src-tauri/              # Rust 백엔드
│   └── src/
│       ├── analysis/       # 시장 상태, 국면, 신호, 통계
│       ├── fetcher/        # 데이터 소스 연동 (FRED, Tiingo 등)
│       ├── indicators/     # 지표 정의 & 계산
│       ├── commands/       # Tauri 커맨드 핸들러
│       ├── core/           # 스케줄러, 알림
│       ├── llm/            # AI 리포트 생성
│       └── db.rs           # SQLite 데이터베이스 레이어
├── docs/                   # 문서 & 법적 분석
└── public/                 # 정적 자산
```

---

## 📊 데이터 소스 & 출처 표시

| 소스 | 데이터 | 라이선스/약관 |
|------|--------|---------------|
| [FRED](https://fred.stlouisfed.org/) | 거시경제 지표 | [FRED 약관](https://fred.stlouisfed.org/docs/api/terms_of_use.html) |
| [Tiingo](https://www.tiingo.com/) | 주식, 암호화폐, FX 가격 | [Tiingo 약관](https://www.tiingo.com/about/terms) |
| [Finnhub](https://finnhub.io/) | 실적 & IPO 캘린더 | [Finnhub 약관](https://finnhub.io/terms-of-service) |
| [Binance](https://www.binance.com/) | 암호화폐 시장 데이터 | [Binance 약관](https://www.binance.com/en/terms) |
| [U.S. EIA](https://www.eia.gov/) | 에너지 데이터 | 미국 정부 공공 데이터 |
| [World Bank](https://data.worldbank.org/) | 글로벌 GDP 데이터 | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| [Alternative.me](https://alternative.me/) | 암호화폐 공포 & 탐욕 지수 | [Alternative.me API](https://alternative.me/crypto/fear-and-greed-index/) |

---

## 🤝 기여하기

기여를 환영합니다! [CONTRIBUTING.md](./CONTRIBUTING.md)를 참고해주세요.

특히 도움이 필요한 영역:
- 추가 데이터 소스 연동 (Alpha Vantage, Twelve Data 등)
- 새로운 지표 계산
- UI/UX 개선
- 버그 수정 및 성능 최적화
- 번역 (i18n)

---

## ⚖️ 면책 조항

이 소프트웨어는 **정보 제공 및 교육 목적**으로만 제공됩니다. 투자 조언, 재정 조언, 또는 증권의 매수·매도·보유에 대한 어떠한 추천도 해당하지 않습니다. 전체 면책 조항은 [DISCLAIMER.md](./DISCLAIMER.md)를 참고하세요.

---

## 📄 라이선스

이 프로젝트는 [MIT 라이선스](./LICENSE)로 공개됩니다.
