# 5-Phase 개선 로드맵 법적 리스크 분석

> **분석 일자:** 2026-02-12  
> **분석 대상:** `action-plan.md`에 제안된 5단계 개선 로드맵  
> **전제:** FRED, Tiingo, Finnhub은 사용자 본인 API 키 모델 적용 중

---

## 요약: Phase별 법적 리스크 등급

| Phase | 내용 | 법적 리스크 | 핵심 이슈 |
|-------|------|:-----------:|-----------|
| **Phase 1** | Actionable Signals | 🟠 **High** | 투자 자문(Investment Advice) 규제 |
| **Phase 2** | 온보딩 마찰 제거 | 🟡 Medium | 번들 스냅샷 = FRED 캐싱/아카이빙 위반 가능 |
| **Phase 3** | 웹 랜딩 + 위젯 | 🔴 **Critical** | 사용자 키 모델 **완전 붕괴** — 재배포 문제 재발 |
| **Phase 4** | 이메일 알림/구독 | 🟠 **High** | 이메일로 데이터 전송 = 재배포, CAN-SPAM 규제 |
| **Phase 5** | 런칭 & 마케팅 | 🟡 Medium | 마케팅 문구 면책, Bloomberg 비교 표현 주의 |

---

## Phase 1: ⚡ Actionable Signals — 🟠 High

### 문제: SEC/FINRA 투자 자문 규제

제안된 Signal 메시지들이 **투자 자문(Investment Advice)**으로 해석될 수 있습니다.

| 제안된 문구 | 법적 위험 | 이유 |
|------------|:---------:|------|
| "채권 비중을 15%→25%로 조정 검토" | 🔴 | **구체적 자산 배분 비율 제시** = 투자 자문 |
| "Consider increasing defensive allocation" | 🟠 | 구체적 행동 제안 = 자문 의심 |
| "DCA 전략 고려" | 🟠 | 특정 투자 전략 추천 |
| "이익실현 고려" | 🟠 | 매매 타이밍 제안 |
| "헤지 검토" | 🟠 | 특정 투자 행동 추천 |

### 해결책

**방법 1: 문구를 "사실 전달" 형태로 수정**

```diff
- "채권 비중을 15%→25%로 조정 검토"
+ "역사적으로 Risk Score 65 이상 구간에서 방어적 자산이 상대적 초과수익을 보였습니다."

- "DCA 전략 고려"
+ "과거 동일 조건에서 시장은 90일 내 평균 -8% 수익률을 기록했습니다."

- "이익실현 고려"
+ "Buffett Indicator 180% 이상 구간에서 시장은 역사적으로 20-40% 조정을 경험했습니다."
```

**방법 2: 포괄적 면책 조항 (필수, 방법 1과 병행)**

> "This tool provides market data analysis for informational and educational purposes only. It does NOT constitute investment advice, financial advice, or any recommendation to buy, sell, or hold any security. Past performance and historical patterns are not indicative of future results. Always consult a qualified, licensed financial advisor before making any investment decisions."

> **중요:** 문구 수정만으로 리스크가 "제거"되는 것은 아닙니다.
> `LEGAL-sec-investment-advice.md` 문서에서 SEC의 실제 판단 기준과 Publisher's Exclusion에 대해 상세 분석했습니다.

---

## Phase 2: 🚪 온보딩 마찰 제거 — 🟡 Medium

### 문제: 번들 스냅샷 데이터 = FRED 아카이빙 위반

"과거 실제 스냅샷을 번들링"하여 데모 데이터로 제공하는 제안이 있었습니다.

스냅샷에 **FRED 데이터가 포함**되면:

| FRED ToS 조항 | 위반 여부 |
|--------------|:---------:|
| "storing, caching, or archiving any portion of FRED Content" 금지 | 🔴 위반 |
| "providing any stored content to any third party" 금지 | 🔴 위반 |
| "incorporating FRED Content into any database, compilation, archive" 금지 | 🔴 위반 |

### 해결책

**권장:** 번들 스냅샷에는 FRED 외 소스(EIA, World Bank, 자체 계산 지표)만 포함.
FRED 데이터는 사용자가 키를 입력해야만 로딩. 
"이 데이터는 데모용이며, 전체 분석을 위해 FRED API 키가 필요합니다" 안내 표시.

---

## Phase 3: 🌐 웹 랜딩 + 위젯 — 🔴 Critical

### 문제: 사용자 API 키 모델 완전 붕괴

> ⚠️ **Phase 3은 현재 법적 안전 구조를 근본적으로 파괴합니다.**

제안된 내용:
1. **웹 서버에서 Risk Score 계산** → "1시간마다 FRED + Yahoo 데이터 갱신"
2. **공개 Risk Score API** → 누구나 접근 가능
3. **임베드 위젯** → 제3자 사이트에 데이터 표시

이렇게 되면:
- **서버가 자체 API 키로 데이터를 수집** → "도구 제공" 모델이 아닌 **"데이터 재배포"** 모델
- FRED 데이터 → 서버에 저장 + 웹으로 재배포 = **ToS 위반 확정**
- Yahoo Finance → 비공식 API로 서버에서 수집 + 공개 = **이중 위반**
- Tiingo → 재배포 라이선스 없이 API로 제공 = **ToS 위반**

| 구분 | 현재 (데스크톱, 사용자 키) | Phase 3 제안 (웹 서버) |
|------|:------------------------:|:---------------------:|
| 데이터 수집 주체 | 사용자 본인 | **서버 (개발자)** |
| 법적 분류 | 도구 제공 | **데이터 재배포** |
| FRED ToS | ✅ Safe | 🔴 위반 |
| Tiingo ToS | ✅ Safe | 🔴 위반 |
| Yahoo ToS | 🔴 위반 (이미) | 🔴 위반 (악화) |

### 해결책

**권장: Phase 3 범위 축소**

```
웹 랜딩 페이지는 만들되:
✅ 제품 소개, 스크린샷, 가격, 다운로드 링크
✅ "현재 Risk Score: 43" → 개발자 본인의 앱에서 수동으로 업데이트 (정적 값)
❌ 실시간 Risk Score API 서버 → 제거
❌ 임베드 위젯 → 제거 (또는 "데스크톱 앱 다운로드" 링크만)
❌ 서버에서 자동 데이터 갱신 → 제거
```

또는 Risk Score 숫자만 공개 (원시 데이터 제외):
```
✅ Risk Score: 43 (숫자만, 자체 계산 지표)
✅ "Market Regime: Goldilocks" (라벨만)
❌ VIX: 32.5 (원시 데이터 = 재배포)
❌ CPI: 3.2% (원시 데이터 = 재배포)
```

> Risk Score 자체는 **자체 계산 지표**이므로 공개에 문제가 없습니다.
> 단, 그 계산에 사용된 **원시 데이터를 함께 노출하면 재배포**에 해당합니다.

---

## Phase 4: 📧 이메일 알림/구독 — 🟠 High

### 문제 1: 이메일 데이터 전송 = 재배포

| 제안된 이메일 내용 | 재배포 해당 여부 |
|-------------------|:---------------:|
| "Risk Score: 43 → 51" | ✅ Safe (자체 계산) |
| "VIX 스파이크 (2/13)" | 🟠 VIX 값은 CBOE 데이터 |
| "시장 국면: Goldilocks → Reflation" | ✅ Safe (자체 분류) |
| 주간 리포트에 구체적 지표 값 포함 | 🔴 재배포 해당 |

### 문제 2: CAN-SPAM Act 준수

미국에서 상업적 이메일 발송 시 **CAN-SPAM Act** 준수 필수:
- 발신자 정보 명시
- 구독 해지(Unsubscribe) 링크 필수
- 오해의 소지가 있는 제목 금지
- 위반 시 **이메일당 최대 $51,744 벌금**

### 해결책

```
이메일에 포함 가능:     이메일에 포함 불가:
✅ Risk Score 변화       ❌ 개별 지표의 구체적 수치
✅ 활성 Signal 수/등급   ❌ 원시 차트 데이터
✅ Market Regime 라벨    ❌ AI 리포트 전문 (FRED 데이터 기반)
✅ "앱에서 확인" 링크
```

---

## Phase 5: 🚀 런칭 & 마케팅 — 🟡 Medium

### 문제

| 항목 | 위험 |
|------|------|
| "Bloomberg $24K vs 우리 $249" | 상표권 침해 + 기능 동등 암시 = FTC Act 위반 가능 |
| "Signal이 맞았나?" 백테스트 공개 | SEC가 "투자 자문 광고"로 간주 가능 |
| Reddit r/investing 홍보 | Rule 3 Self-Promotion 위반 가능 |

### 해결책

```diff
- "Bloomberg $24K vs 우리 $249"
+ "전문 투자자용 매크로 분석을 개인 투자자 가격으로"

- "Signal이 맞았나? 백테스트 결과"
+ "지난 달 시장 분석 리뷰" + 면책 조항 필수
```

---

## 📋 Phase별 조치 요약

| Phase | 핵심 리스크 | 필수 조치 | 난이도 |
|-------|------------|----------|:------:|
| **1** | 투자 자문 표현 | 문구를 "사실 전달" 형태로 수정 + 면책 조항 | 하 |
| **2** | FRED 번들 스냅샷 | FRED 데이터 제외, 공공 데이터만 번들링 | 하 |
| **3** | 서버 = 재배포 | ⚠️ **실시간 API 서버/위젯 제거 또는 범위 축소** | 중 |
| **4** | 이메일 = 재배포 | 자체 계산 지표만 이메일 포함, 원시 데이터 제외 | 하 |
| **5** | 마케팅 면책 | Bloomberg 직접 비교 제거, 면책 조항 추가 | 하 |
