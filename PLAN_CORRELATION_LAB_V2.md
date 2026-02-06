# 🔬 Correlation Lab v2.0 - Implementation Plan

> **Created:** 2026-01-25
> **Status:** Planning
> **Priority:** High

---

## 📋 Overview

Correlation Lab을 **4가지 분석 모드**를 지원하는 **종합 상관관계 분석 도구**로 확장합니다.

### 🎯 Goals
1. **Matrix Mode**: N×N 상관관계 행렬 히트맵
2. **Multi-Chart Mode**: N개 지표 오버레이 차트
3. **Ranked Mode**: 기준 지표 대비 상관관계 순위
4. **Pair Mode** (기존): 2개 지표 상세 비교

---

## 🏗️ Architecture

### UI Structure
```
CorrelationLabView.tsx (리팩토링)
├── Header (지표 선택 UI)
├── Mode Tabs: [ Matrix | Multi-Chart | Ranked | Pair ]
└── Content Area (모드별 렌더링)
    ├── MatrixView.tsx
    ├── MultiChartView.tsx
    ├── RankedView.tsx
    └── PairView.tsx (기존 로직 분리)
```

### Backend Commands
```rust
// 기존
calculate_correlation(asset_a, asset_b, range) -> CorrelationResult

// 신규
calculate_correlation_matrix(assets: Vec<String>, range) -> MatrixResult
calculate_ranked_correlations(reference: String, range) -> RankedResult
```

---

## 📦 Phase 1: Backend - Matrix Calculation

### Task 1.1: `calculate_correlation_matrix` Command

**Input:**
```rust
struct MatrixRequest {
    assets: Vec<String>,  // ["spx", "btc", "gold", "vix"]
    range: String,        // "1Y"
}
```

**Output:**
```rust
struct MatrixResult {
    labels: Vec<String>,              // 지표 이름들
    matrix: Vec<Vec<f64>>,            // N×N 상관계수 행렬
    data_points: usize,               // 분석에 사용된 데이터 포인트 수
}
```

**Algorithm:**
1. 모든 지표의 historical_data 로드
2. 날짜 기준 Inner Join (공통 날짜만)
3. 모든 쌍(i, j)에 대해 피어슨 상관계수 계산
4. 대칭 행렬 반환 (matrix[i][j] == matrix[j][i])

**File:** `src-tauri/src/analysis.rs`

---

### Task 1.2: `calculate_ranked_correlations` Command

**Input:**
```rust
struct RankedRequest {
    reference: String,  // 기준 지표 (e.g., "binance_btc_usdt")
    range: String,
    limit: Option<usize>,  // 상위 N개만 (기본: 전체)
}
```

**Output:**
```rust
struct RankedResult {
    reference_name: String,
    correlations: Vec<CorrelationRank>,  // 정렬된 목록
}

struct CorrelationRank {
    slug: String,
    name: String,
    coefficient: f64,
    direction: String,  // "positive" | "negative"
}
```

**Algorithm:**
1. 기준 지표 데이터 로드
2. 모든 다른 지표와 상관계수 계산
3. 상관계수 절대값 기준 내림차순 정렬

**File:** `src-tauri/src/analysis.rs`

---

## 📦 Phase 2: Frontend - Tab-Based Layout

### Task 2.1: CorrelationLabView 리팩토링

**현재 구조:**
```tsx
CorrelationLabView.tsx (단일 파일, Pair 모드만)
```

**목표 구조:**
```tsx
CorrelationLabView.tsx
├── State: activeMode ("matrix" | "multi" | "ranked" | "pair")
├── State: selectedAssets: string[] (다중 선택용)
├── State: referenceAsset: string (Ranked 모드용)
├── Header: 모드별 다른 컨트롤 렌더링
├── Tabs: Mode 전환 버튼
└── Content: 조건부 렌더링
    ├── activeMode === "matrix" → <MatrixView />
    ├── activeMode === "multi" → <MultiChartView />
    ├── activeMode === "ranked" → <RankedView />
    └── activeMode === "pair" → <PairView />
```

---

### Task 2.2: Multi-Select Combobox

**목적:** Matrix, Multi-Chart 모드에서 여러 지표 선택

**UI:**
```
┌───────────────────────────────────────────────┐
│ Select Assets (3 selected)              [▼]   │
├───────────────────────────────────────────────┤
│ ☑ S&P 500                                     │
│ ☑ Bitcoin                                     │
│ ☑ Gold                                        │
│ ☐ VIX                                         │
│ ☐ Nasdaq 100                                  │
│ ...                                           │
└───────────────────────────────────────────────┘
```

**Component:** `MultiSelectCombobox.tsx`

---

## 📦 Phase 3: Mode-Specific Views

### Task 3.1: MatrixView (Option A)

**UI Design:**
```
┌─────────────────────────────────────────────────────┐
│  Correlation Matrix                                 │
├─────────────────────────────────────────────────────┤
│         SPX     BTC    Gold    VIX     NDX          │
│  SPX   [1.00]  [0.65] [0.12] [-0.45] [0.92]        │
│  BTC   [0.65]  [1.00] [0.08] [-0.30] [0.71]        │
│  Gold  [0.12]  [0.08] [1.00] [0.25]  [0.15]        │
│  VIX   [-0.45] [-0.30][0.25] [1.00] [-0.52]        │
│  NDX   [0.92]  [0.71] [0.15] [-0.52] [1.00]        │
└─────────────────────────────────────────────────────┘
```

**Features:**
- CSS Grid 기반 히트맵
- 색상 스케일: 🔴 -1.0 (음의 상관) ↔ ⚪ 0.0 ↔ 🔵 +1.0 (양의 상관)
- 셀 호버 시 정확한 값 툴팁
- 셀 클릭 시 Pair 모드로 이동 (상세 분석)

**File:** `src/components/views/analysis/MatrixView.tsx`

---

### Task 3.2: MultiChartView (Option B)

**UI Design:**
```
┌─────────────────────────────────────────────────────┐
│  Multi-Line Comparison                              │
├─────────────────────────────────────────────────────┤
│  [Legend: ● SPX  ● BTC  ● Gold  ● VIX]              │
│  ┌───────────────────────────────────────────────┐  │
│  │  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~          │  │
│  │     ~~~~~~~~~~~    ~~~~~~~~~~~                │  │
│  │  ~~~     ~~~~~~  ~~~~    ~~~~                 │  │
│  │   (4개 라인 오버레이, 정규화 0-1)             │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Features:**
- Lightweight Charts에 `addSeries`를 N번 호출
- 각 시리즈 색상 자동 할당 (파랑, 주황, 초록, 빨강, 보라...)
- 범례(Legend) 표시
- 최대 8개 제한 권장 (시각적 명확성)

**File:** `src/components/views/analysis/MultiChartView.tsx`

---

### Task 3.3: RankedView (Option D)

**UI Design:**
```
┌─────────────────────────────────────────────────────┐
│  Correlation Ranking                                │
├─────────────────────────────────────────────────────┤
│  Reference: [Bitcoin ▼]                             │
├─────────────────────────────────────────────────────┤
│  🥇 1. Nasdaq 100      +0.78  ████████████████░░░░  │
│  🥈 2. S&P 500         +0.65  █████████████░░░░░░░  │
│  🥉 3. Ethereum        +0.55  ███████████░░░░░░░░░  │
│     4. Apple           +0.52  ██████████░░░░░░░░░░  │
│     ...                                             │
│    95. VIX             -0.45  ████████░░░░░░░░░░░░  │
│    96. Gold            -0.12  ██░░░░░░░░░░░░░░░░░░  │
└─────────────────────────────────────────────────────┘
```

**Features:**
- 기준 지표 선택 드롭다운
- 전체 지표와의 상관계수 계산 후 순위표
- 진행률 바(Progress Bar)로 시각화
- 양(+)은 파랑, 음(-)은 빨강
- 행 클릭 시 Pair 모드로 이동

**File:** `src/components/views/analysis/RankedView.tsx`

---

### Task 3.4: PairView (Option C - 기존 리팩토링)

**현재:** CorrelationLabView.tsx에 포함
**목표:** `PairView.tsx`로 분리

**변경사항:**
- 기존 듀얼 라인 차트 로직 그대로 유지
- Props로 `assetA`, `assetB`, `range` 받음
- 부모에서 호출하여 재사용

**File:** `src/components/views/analysis/PairView.tsx`

---

## 📦 Phase 4: Integration & Polish

### Task 4.1: Mode Navigation

- Matrix/Ranked에서 셀/행 클릭 시 Pair 모드로 자동 전환
- URL Query Param 또는 State로 전환 관리

### Task 4.2: Loading States

- 각 모드별 스켈레톤 UI
- 대용량 계산 시 프로그레스 표시

### Task 4.3: Error Handling

- 지표 선택 안 했을 때 안내
- 데이터 없을 때 빈 상태 UI

---

## 📅 Implementation Order

| Order | Task | Estimated Time | Dependency |
|-------|------|----------------|------------|
| 1 | Backend: `calculate_correlation_matrix` | 10min | - |
| 2 | Backend: `calculate_ranked_correlations` | 10min | - |
| 3 | Frontend: Tab Layout 리팩토링 | 15min | - |
| 4 | Frontend: MultiSelectCombobox | 15min | - |
| 5 | Frontend: MatrixView | 20min | Task 1, 3, 4 |
| 6 | Frontend: MultiChartView | 15min | Task 3, 4 |
| 7 | Frontend: RankedView | 15min | Task 2, 3 |
| 8 | Frontend: PairView 분리 | 10min | Task 3 |
| 9 | Integration & Polish | 15min | All |

**Total:** ~125min (~2시간)

---

## 🎨 Color Palette for Correlation

```css
/* Heatmap Color Scale */
--correlation-strong-positive: #2563eb; /* Blue 600 */
--correlation-moderate-positive: #60a5fa; /* Blue 400 */
--correlation-weak: #6b7280; /* Gray 500 */
--correlation-moderate-negative: #f87171; /* Red 400 */
--correlation-strong-negative: #dc2626; /* Red 600 */

/* Chart Line Colors (up to 8) */
--line-1: #3b82f6; /* Blue */
--line-2: #f97316; /* Orange */
--line-3: #22c55e; /* Green */
--line-4: #ef4444; /* Red */
--line-5: #a855f7; /* Purple */
--line-6: #eab308; /* Yellow */
--line-7: #06b6d4; /* Cyan */
--line-8: #ec4899; /* Pink */
```

---

## ✅ Acceptance Criteria

- [ ] 4가지 모드 모두 정상 작동
- [ ] 모드 간 전환 부드러움
- [ ] Matrix 셀 클릭 → Pair 모드 이동
- [ ] Ranked 행 클릭 → Pair 모드 이동
- [ ] 데이터 없을 때 적절한 Empty State
- [ ] 모든 모드에서 기간(Period) 선택 가능
- [ ] 다크/라이트 모드 모두 정상 표시

---

## 📝 Notes

- Matrix 계산은 O(N²) 복잡도 → 20개 이상 선택 시 경고 표시 권장
- Multi-Chart는 8개 이상 시 시각적 혼잡 → 제한 또는 경고
- 기존 Pair 모드의 UX는 유지하면서 확장

---

**Ready to implement!** 🚀
