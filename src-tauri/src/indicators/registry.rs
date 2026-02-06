use once_cell::sync::Lazy;
use serde::Serialize;
use std::collections::HashMap;

use crate::indicators::buffett::BuffettIndicator;
use crate::indicators::copper_gold::CopperGoldRatio;
use crate::indicators::commodity_ratios::GoldSilverRatio;
use crate::indicators::financial_stress::FinancialStress;
// use crate::indicators::kimchi::KimchiPremium;
use crate::indicators::liquidity::NetLiquidity;
use crate::indicators::yield_curve::{YieldCurve10Y2Y, YieldCurve10Y3M};
use crate::indicators::macro_indicators::RealYield10Y;
use crate::indicators::yield_gap::YieldGap;
use crate::indicators::liquidity_spreads::{CommercialPaperSpread, SofrSpread};
use crate::indicators::CalculatedIndicator;

// ============================================================================
// ENUMS
// ============================================================================

#[derive(Debug, Clone, PartialEq, Serialize)]
pub enum SourceType {
    Fred,
    Tiingo,
    // Upbit,
    Binance,
    Glassnode,
    Alternative, // alternative.me, etc.
    Manual,      // User-entered data
    Calculated,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub enum Category {
    Valuation,    // 밸류에이션 & 버블
    Liquidity,    // 유동성 & 리스크
    UsMacro,      // 미국 경제 (금리, 고용, 물가)
    UsStocks,     // 미국 주식
    KoreaMacro,   // 한국 경제
    KoreaStocks,  // 한국 주식
    Crypto,       // 가상자산
    Commodities,  // 원자재
    RealEstate,   // 부동산
    Global,       // 글로벌 매크로
    Risk,         // 리스크 & 센티먼트
    Technical,    // 기술적 지표
    Internal,     // 내부용 (UI에 표시 안함)
}

/// Defines how the indicator value should be formatted/displayed
#[derive(Debug, Clone, PartialEq, Serialize)]
pub enum UnitType {
    /// Raw value as-is (e.g., Index like Case-Shiller 328.44)
    Index,
    /// Percentage (e.g., 4.26 -> "4.26%")
    Percent,
    /// USD Price (e.g., 2750.50 -> "$2,750.50")
    UsdPrice,
    /// KRW Price (e.g., 150000000 -> "₩150,000,000")
    KrwPrice,
    /// Already in Billions from source (e.g., FRED GDP = 28000 means $28T)
    Billions,
    /// Already in Millions from source (e.g., FRED WALCL)
    Millions,
    /// Already in Thousands from source
    Thousands,
    /// Raw US Dollars - auto convert to T/B/M (e.g., Net Liquidity result in dollars)
    Dollars,
    /// Ratio (e.g., Copper/Gold ratio 1.85)
    Ratio,
}

// ============================================================================
// METADATA STRUCT
// ============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct IndicatorMetadata {
    pub slug: String,
    pub name: String,
    pub source: SourceType,
    pub category: Category,
    pub description: Option<String>,
    pub source_symbol: Option<String>,
    pub unit: UnitType,
    pub source_url: Option<String>,
    pub frequency: Option<String>, // e.g., "Daily", "Monthly", "Quarterly"
    pub has_history: bool, // NEW: Can we fetch full history?
}

// Helper macro to reduce boilerplate
macro_rules! ind {
    // Pattern with 10 arguments (Explicit history)
    ($slug:expr, $name:expr, $source:expr, $cat:expr, $desc:expr, $sym:expr, $unit:expr, $url:expr, $freq:expr, $hist:expr) => {
        IndicatorMetadata {
            slug: $slug.to_string(),
            name: $name.to_string(),
            source: $source,
            category: $cat,
            description: Some($desc.to_string()),
            source_symbol: $sym.map(|s: &str| s.to_string()),
            unit: $unit,
            source_url: $url.map(|s: &str| s.to_string()),
            frequency: $freq.map(|s: &str| s.to_string()),
            has_history: $hist,
        }
    };
    // Pattern with 9 arguments (Default history = true)
    ($slug:expr, $name:expr, $source:expr, $cat:expr, $desc:expr, $sym:expr, $unit:expr, $url:expr, $freq:expr) => {
        ind!($slug, $name, $source, $cat, $desc, $sym, $unit, $url, $freq, true)
    };
}

// ============================================================================
// STATIC INDICATOR REGISTRY (Lazy initialization, O(1) lookup)
// ============================================================================

static INDICATORS: Lazy<Vec<IndicatorMetadata>> = Lazy::new(|| {
    vec![
        // =====================================================================
        // CALCULATED INDICATORS (계산 지표)
        // =====================================================================
        ind!("buffett_indicator", "Buffett Indicator", SourceType::Calculated, Category::Valuation,
             "Market Cap to GDP Ratio. >100% = overvalued", None, UnitType::Percent, None, Some("Daily")),
        ind!("yield_curve_10y_2y", "10Y-2Y Yield Curve", SourceType::Calculated, Category::UsMacro,
             "Spread between 10Y and 2Y Treasury. Negative = recession signal", None, UnitType::Percent, None, Some("Daily")),
        ind!("yield_curve_10y_3m", "10Y-3M Yield Curve", SourceType::Calculated, Category::UsMacro,
             "Spread between 10Y and 3M Treasury. More accurate recession predictor", None, UnitType::Percent, None, Some("Daily")),
        ind!("net_liquidity", "Net Liquidity", SourceType::Calculated, Category::Liquidity,
             "Fed Balance Sheet - TGA - RRP. Drives equity markets", None, UnitType::Dollars, None, Some("Weekly")),
        ind!("financial_stress", "Financial Stress Index", SourceType::Calculated, Category::Risk,
             "St. Louis Fed Financial Stress Index", None, UnitType::Index, Some("https://fred.stlouisfed.org/series/STLFSI4"), Some("Weekly")),
        // ind!("kimchi_premium", "Kimchi Premium", SourceType::Calculated, Category::Crypto,
        //      "Korea vs Global BTC price difference %. >5% = overheated", None, UnitType::Percent, None, Some("Daily")),
        ind!("copper_gold_ratio", "Copper/Gold Ratio", SourceType::Calculated, Category::Global,
             "Economic health indicator. Rising = growth, Falling = risk-off", None, UnitType::Ratio, None, Some("Daily")),
        ind!("gold_silver_ratio", "Gold/Silver Ratio", SourceType::Calculated, Category::Commodities,
             "Safe haven demand. High = fear, Low = risk-on", None, UnitType::Ratio, None, Some("Daily")),
        ind!("real_yield", "Real Yield (10Y)", SourceType::Calculated, Category::UsMacro,
             "10Y Treasury - Breakeven Inflation", None, UnitType::Percent, Some("https://fred.stlouisfed.org/series/DFII10"), Some("Daily")),
        ind!("yield_gap", "Yield Gap", SourceType::Calculated, Category::Valuation,
             "Earnings Yield (S&P 500) - 10Y Treasury Yield. >0 = Stocks Cheap, <0 = Stocks Expensive", None, UnitType::Percent, None, Some("Monthly")),
        
        // NEW LIQUIDITY SPREADS
        ind!("cp_bill_spread", "Commercial Paper Spread", SourceType::Calculated, Category::Risk,
             "CP 3M - T-Bill 3M. Corporate funding stress (TED Spread alternative)", None, UnitType::Percent, None, Some("Daily")),
        ind!("sofr_spread", "SOFR - Fed Funds", SourceType::Calculated, Category::Liquidity,
             "Repo market stress indicator. Positive = collateral scarcity or stress", None, UnitType::Percent, None, Some("Daily")),

        // =====================================================================
        // FRED - VALUATION (밸류에이션 원본 데이터)
        // =====================================================================
        ind!("us_market_cap", "US Total Market Cap", SourceType::Fred, Category::Valuation,
             "Total market value of US corporate equities (Quarterly)", Some("NCBEILQ027S"), UnitType::Millions, Some("https://fred.stlouisfed.org/series/NCBEILQ027S"), Some("Quarterly")),

        // =====================================================================
        // FRED - TREASURY & RATES (금리)
        // =====================================================================
        ind!("us_10y", "10-Year Treasury Yield", SourceType::Fred, Category::UsMacro,
             "Benchmark long-term rate. Affects all asset valuations", Some("DGS10"), UnitType::Percent, Some("https://fred.stlouisfed.org/series/DGS10"), Some("Daily")),
        ind!("us_2y", "2-Year Treasury Yield", SourceType::Fred, Category::UsMacro,
             "Fed policy expectations proxy", Some("DGS2"), UnitType::Percent, Some("https://fred.stlouisfed.org/series/DGS2"), Some("Daily")),
        ind!("us_3m", "3-Month Treasury Yield", SourceType::Fred, Category::UsMacro,
             "Risk-free rate benchmark", Some("DGS3MO"), UnitType::Percent, Some("https://fred.stlouisfed.org/series/DGS3MO"), Some("Daily")),
        ind!("us_30y", "30-Year Treasury Yield", SourceType::Fred, Category::UsMacro,
             "Long-term inflation expectations", Some("DGS30"), UnitType::Percent, Some("https://fred.stlouisfed.org/series/DGS30"), Some("Daily")),
        ind!("us_5y", "5-Year Treasury Yield", SourceType::Fred, Category::UsMacro,
             "Medium-term rate", Some("DGS5"), UnitType::Percent, Some("https://fred.stlouisfed.org/series/DGS5"), Some("Daily")),
        ind!("us_1y", "1-Year Treasury Yield", SourceType::Fred, Category::UsMacro,
             "Short-term rate", Some("DGS1"), UnitType::Percent, Some("https://fred.stlouisfed.org/series/DGS1"), Some("Daily")),
        ind!("tips_10y", "10-Year TIPS Yield", SourceType::Fred, Category::UsMacro,
             "Real interest rate (inflation-protected)", Some("DFII10"), UnitType::Percent, Some("https://fred.stlouisfed.org/series/DFII10"), Some("Daily")),
        ind!("breakeven_10y", "10Y Breakeven Inflation", SourceType::Fred, Category::UsMacro,
             "Market's inflation expectation", Some("T10YIE"), UnitType::Percent, Some("https://fred.stlouisfed.org/series/T10YIE"), Some("Daily")),
        ind!("fed_funds", "Fed Funds Rate", SourceType::Fred, Category::UsMacro,
             "Federal Reserve policy rate", Some("FEDFUNDS"), UnitType::Percent, Some("https://fred.stlouisfed.org/series/FEDFUNDS"), Some("Daily")),
        
        // NEW RAW DATA for Liquidity Spreads
        ind!("cp_3m_rate", "3-Month Commercial Paper", SourceType::Fred, Category::Internal,
             "3-Month AA Financial Commercial Paper Rate", Some("CPF3M"), UnitType::Percent, Some("https://fred.stlouisfed.org/series/CPF3M"), Some("Daily")),
        ind!("sofr_30d", "SOFR (30-Day Avg)", SourceType::Fred, Category::Internal,
             "Secured Overnight Financing Rate (30-Day Average)", Some("SOFR30DAYAVG"), UnitType::Percent, Some("https://fred.stlouisfed.org/series/SOFR30DAYAVG"), Some("Daily")),


        // =====================================================================
        // FRED - EMPLOYMENT (고용)
        // =====================================================================
        ind!("unrate", "Unemployment Rate", SourceType::Fred, Category::UsMacro,
             "US unemployment rate. <4% = tight labor market", Some("UNRATE"), UnitType::Percent, Some("https://fred.stlouisfed.org/series/UNRATE"), Some("Monthly")),
        ind!("nfp", "Nonfarm Payrolls", SourceType::Fred, Category::UsMacro,
             "Monthly job additions. Key employment indicator", Some("PAYEMS"), UnitType::Thousands, Some("https://fred.stlouisfed.org/series/PAYEMS"), Some("Monthly")),
        ind!("jolts", "Job Openings (JOLTS)", SourceType::Fred, Category::UsMacro,
             "Labor demand. Falling = economic slowdown signal", Some("JTSJOL"), UnitType::Thousands, Some("https://fred.stlouisfed.org/series/JTSJOL"), Some("Monthly")),
        ind!("initial_claims", "Initial Jobless Claims", SourceType::Fred, Category::UsMacro,
             "Weekly unemployment filings. Rising = recession signal", Some("ICSA"), UnitType::Thousands, Some("https://fred.stlouisfed.org/series/ICSA"), Some("Weekly")),
        ind!("continued_claims", "Continued Claims", SourceType::Fred, Category::UsMacro,
             "Ongoing unemployment. Lagging indicator", Some("CCSA"), UnitType::Thousands, Some("https://fred.stlouisfed.org/series/CCSA"), Some("Weekly")),
        ind!("labor_force_part", "Labor Force Participation", SourceType::Fred, Category::UsMacro,
             "Working-age population in workforce", Some("CIVPART"), UnitType::Percent, Some("https://fred.stlouisfed.org/series/CIVPART"), Some("Monthly")),
        ind!("u6_rate", "U-6 Unemployment Rate", SourceType::Fred, Category::UsMacro,
             "Broad unemployment including underemployed", Some("U6RATE"), UnitType::Percent, Some("https://fred.stlouisfed.org/series/U6RATE"), Some("Monthly")),
 
        // =====================================================================
        // FRED - INFLATION & PRICES (물가)
        // =====================================================================
        ind!("cpi", "Consumer Price Index", SourceType::Fred, Category::UsMacro,
             "Headline inflation measure", Some("CPIAUCSL"), UnitType::Index, Some("https://fred.stlouisfed.org/series/CPIAUCSL"), Some("Monthly")),
        ind!("core_cpi", "Core CPI (ex Food/Energy)", SourceType::Fred, Category::UsMacro,
             "Underlying inflation trend", Some("CPILFESL"), UnitType::Index, Some("https://fred.stlouisfed.org/series/CPILFESL"), Some("Monthly")),
        ind!("pce", "PCE Price Index", SourceType::Fred, Category::UsMacro,
             "Fed's preferred inflation gauge", Some("PCEPI"), UnitType::Index, Some("https://fred.stlouisfed.org/series/PCEPI"), Some("Monthly")),
        ind!("core_pce", "Core PCE", SourceType::Fred, Category::UsMacro,
             "Fed's primary inflation target (2%)", Some("PCEPILFE"), UnitType::Index, Some("https://fred.stlouisfed.org/series/PCEPILFE"), Some("Monthly")),
        ind!("ppi", "Producer Price Index", SourceType::Fred, Category::UsMacro,
             "Wholesale inflation (leads CPI)", Some("PPIACO"), UnitType::Index, Some("https://fred.stlouisfed.org/series/PPIACO"), Some("Monthly")),
        ind!("import_prices", "Import Price Index", SourceType::Fred, Category::UsMacro,
             "Import inflation", Some("IR"), UnitType::Index, Some("https://fred.stlouisfed.org/series/IR"), Some("Monthly")),

        // =====================================================================
        // FRED - GDP & GROWTH (성장)
        // =====================================================================
        ind!("gdp", "Gross Domestic Product", SourceType::Fred, Category::UsMacro,
             "US economic output (nominal)", Some("GDP"), UnitType::Billions, Some("https://fred.stlouisfed.org/series/GDP"), Some("Quarterly")),
        ind!("real_gdp", "Real GDP", SourceType::Fred, Category::UsMacro,
             "Inflation-adjusted GDP", Some("GDPC1"), UnitType::Billions, Some("https://fred.stlouisfed.org/series/GDPC1"), Some("Quarterly")),
        ind!("gdp_growth", "GDP Growth Rate", SourceType::Fred, Category::UsMacro,
             "Quarterly GDP growth", Some("A191RL1Q225SBEA"), UnitType::Percent, Some("https://fred.stlouisfed.org/series/A191RL1Q225SBEA"), Some("Quarterly")),
        ind!("industrial_prod", "Industrial Production", SourceType::Fred, Category::UsMacro,
             "Manufacturing output index", Some("INDPRO"), UnitType::Index, Some("https://fred.stlouisfed.org/series/INDPRO"), Some("Monthly")),
        ind!("capacity_util", "Capacity Utilization", SourceType::Fred, Category::UsMacro,
             "Factory usage rate. High = inflation pressure", Some("TCU"), UnitType::Percent, Some("https://fred.stlouisfed.org/series/TCU"), Some("Monthly")),
        ind!("ism_pmi", "ISM Manufacturing PMI", SourceType::Fred, Category::UsMacro,
             "Leading economic indicator. >50 = expansion, <50 = contraction", Some("MANEMP"), UnitType::Index, Some("https://fred.stlouisfed.org/series/MANEMP"), Some("Monthly")),
 
        // =====================================================================
        // FRED - CONSUMER & RETAIL (소비)
        // =====================================================================
        ind!("retail_sales", "Retail Sales", SourceType::Fred, Category::UsMacro,
             "Consumer spending indicator", Some("RSXFS"), UnitType::Millions, Some("https://fred.stlouisfed.org/series/RSXFS"), Some("Monthly")),
        ind!("consumer_sentiment", "Michigan Consumer Sentiment", SourceType::Fred, Category::UsMacro,
             "Consumer confidence survey", Some("UMCSENT"), UnitType::Index, Some("https://fred.stlouisfed.org/series/UMCSENT"), Some("Monthly")),
        ind!("personal_income", "Personal Income", SourceType::Fred, Category::UsMacro,
             "Household income", Some("PI"), UnitType::Billions, Some("https://fred.stlouisfed.org/series/PI"), Some("Monthly")),
        ind!("personal_spending", "Personal Spending", SourceType::Fred, Category::UsMacro,
             "Consumer expenditures", Some("PCE"), UnitType::Billions, Some("https://fred.stlouisfed.org/series/PCE"), Some("Monthly")),
        ind!("savings_rate", "Personal Savings Rate", SourceType::Fred, Category::UsMacro,
             "Savings as % of income", Some("PSAVERT"), UnitType::Percent, Some("https://fred.stlouisfed.org/series/PSAVERT"), Some("Monthly")),
 
        // =====================================================================
        // FRED - FED & LIQUIDITY (유동성)
        // =====================================================================
        ind!("fed_balance_sheet", "Fed Balance Sheet", SourceType::Fred, Category::Liquidity,
             "Total Fed assets. QE increases, QT decreases", Some("WALCL"), UnitType::Millions, Some("https://fred.stlouisfed.org/series/WALCL"), Some("Weekly")),
        ind!("treasury_tga", "Treasury General Account", SourceType::Fred, Category::Liquidity,
             "Government cash balance. Drains liquidity when rising", Some("WTREGEN"), UnitType::Millions, Some("https://fred.stlouisfed.org/series/WTREGEN"), Some("Weekly")),
        ind!("fed_rrp", "Reverse Repo (RRP)", SourceType::Fred, Category::Liquidity,
             "Overnight RRP. Absorbs excess liquidity", Some("RRPONTSYD"), UnitType::Billions, Some("https://fred.stlouisfed.org/series/RRPONTSYD"), Some("Daily")),
        ind!("m2", "M2 Money Supply", SourceType::Fred, Category::Liquidity,
             "Broad money supply", Some("M2SL"), UnitType::Billions, Some("https://fred.stlouisfed.org/series/M2SL"), Some("Monthly")),
        ind!("m1", "M1 Money Supply", SourceType::Fred, Category::Liquidity,
             "Narrow money (cash + checking)", Some("M1SL"), UnitType::Billions, Some("https://fred.stlouisfed.org/series/M1SL"), Some("Monthly")),
        ind!("monetary_base", "Monetary Base", SourceType::Fred, Category::Liquidity,
             "Reserve money", Some("BOGMBASE"), UnitType::Billions, Some("https://fred.stlouisfed.org/series/BOGMBASE"), Some("Monthly")),

        // =====================================================================
        // FRED - CREDIT & SPREADS (신용)
        // =====================================================================
        ind!("hy_spread", "High Yield Spread", SourceType::Fred, Category::Risk,
             "Junk bond risk premium. Rising = credit stress", Some("BAMLH0A0HYM2"), UnitType::Percent, Some("https://fred.stlouisfed.org/series/BAMLH0A0HYM2"), Some("Daily")),
        ind!("ig_spread", "IG Corporate Spread", SourceType::Fred, Category::Risk,
             "Investment grade bond spread", Some("BAMLC0A0CM"), UnitType::Percent, Some("https://fred.stlouisfed.org/series/BAMLC0A0CM"), Some("Daily")),
        ind!("credit_spread", "BBB-AAA Spread", SourceType::Fred, Category::Risk,
             "Credit quality spread", Some("BAA10Y"), UnitType::Percent, Some("https://fred.stlouisfed.org/series/BAA10Y"), Some("Daily")),
        ind!("nfci", "Chicago Fed Conditions", SourceType::Fred, Category::Risk,
             "Financial conditions index. Negative = loose", Some("NFCI"), UnitType::Index, Some("https://fred.stlouisfed.org/series/NFCI"), Some("Weekly")),
        ind!("sloos", "Senior Loan Officer Survey", SourceType::Fred, Category::Risk,
             "Bank lending standards. Tightening = recession signal", Some("DRTSCILM"), UnitType::Index, Some("https://fred.stlouisfed.org/series/DRTSCILM"), Some("Quarterly")),
 
        // =====================================================================
        // FRED - HOUSING (주택)
        // =====================================================================
        ind!("case_shiller_index", "Case-Shiller Home Price", SourceType::Fred, Category::RealEstate,
             "US national home price index", Some("CSUSHPINSA"), UnitType::Index, Some("https://fred.stlouisfed.org/series/CSUSHPINSA"), Some("Monthly")),
        ind!("mortgage_30y", "30-Year Mortgage Rate", SourceType::Fred, Category::RealEstate,
             "Average mortgage rate", Some("MORTGAGE30US"), UnitType::Percent, Some("https://fred.stlouisfed.org/series/MORTGAGE30US"), Some("Weekly")),
        ind!("housing_starts", "Housing Starts", SourceType::Fred, Category::RealEstate,
             "New construction starts", Some("HOUST"), UnitType::Thousands, Some("https://fred.stlouisfed.org/series/HOUST"), Some("Monthly")),
        ind!("building_permits", "Building Permits", SourceType::Fred, Category::RealEstate,
             "Future construction indicator", Some("PERMIT"), UnitType::Thousands, Some("https://fred.stlouisfed.org/series/PERMIT"), Some("Monthly")),
 
        // =====================================================================
        // TIINGO - US INDICES (미국 지수)
        // =====================================================================
        ind!("spx", "S&P 500", SourceType::Tiingo, Category::UsStocks,
             "US large-cap benchmark", Some("spy"), UnitType::Index, Some("https://www.tiingo.com/spy"), Some("Daily")),
        ind!("ndx", "Nasdaq 100", SourceType::Tiingo, Category::UsStocks,
             "Tech-heavy index", Some("qqq"), UnitType::Index, Some("https://www.tiingo.com/qqq"), Some("Daily")),
        ind!("djia", "Dow Jones Industrial", SourceType::Tiingo, Category::UsStocks,
             "30 blue-chip stocks", Some("dia"), UnitType::Index, Some("https://www.tiingo.com/dia"), Some("Daily")),
        ind!("russell_2000", "Russell 2000", SourceType::Tiingo, Category::UsStocks,
             "Small-cap benchmark", Some("iwm"), UnitType::Index, Some("https://www.tiingo.com/iwm"), Some("Daily")),
        ind!("vix", "VIX Volatility Index", SourceType::Fred, Category::Risk,
             "Fear gauge. >30 = high fear, <15 = complacency", Some("VIXCLS"), UnitType::Index, Some("https://fred.stlouisfed.org/series/VIXCLS"), Some("Daily")), // Real VIX from FRED
        ind!("vxn", "VXN (Nasdaq Volatility)", SourceType::Manual, Category::Risk,
             "Nasdaq volatility index (No free API available)", None, UnitType::Index, None, Some("Manual")),
        ind!("skew", "SKEW Index", SourceType::Manual, Category::Risk,
             "Black swan risk (No free API available)", None, UnitType::Index, None, Some("Manual")),

        // =====================================================================
        // TIINGO - GLOBAL INDICES (글로벌 지수)
        // =====================================================================
        ind!("nikkei", "Nikkei 225", SourceType::Tiingo, Category::Global,
             "Japan benchmark", Some("ewj"), UnitType::Index, Some("https://www.tiingo.com/ewj"), Some("Daily")),
        ind!("shanghai", "Shanghai Composite", SourceType::Tiingo, Category::Global,
             "China A-shares", Some("mchi"), UnitType::Index, Some("https://www.tiingo.com/mchi"), Some("Daily")),
        ind!("hang_seng", "Hang Seng", SourceType::Tiingo, Category::Global,
             "Hong Kong benchmark", Some("ewh"), UnitType::Index, Some("https://www.tiingo.com/ewh"), Some("Daily")),
        ind!("dax", "DAX", SourceType::Tiingo, Category::Global,
             "Germany benchmark", Some("ewg"), UnitType::Index, Some("https://www.tiingo.com/ewg"), Some("Daily")),
        ind!("ftse", "FTSE 100", SourceType::Tiingo, Category::Global,
             "UK benchmark", Some("ewu"), UnitType::Index, Some("https://www.tiingo.com/ewu"), Some("Daily")),
        ind!("euro_stoxx", "Euro Stoxx 50", SourceType::Tiingo, Category::Global,
             "Eurozone blue chips", Some("fez"), UnitType::Index, Some("https://www.tiingo.com/fez"), Some("Daily")),

        // =====================================================================
        // TIINGO - CURRENCIES (환율)
        // =====================================================================
        ind!("dxy", "Dollar Index (DXY)", SourceType::Tiingo, Category::Global,
             "USD vs 6 major currencies", Some("uup"), UnitType::Index, Some("https://www.tiingo.com/uup"), Some("Daily")), // UUP (Bullish) is better proxy than UDN
        ind!("eur_usd", "EUR/USD", SourceType::Fred, Category::Global,
             "Euro vs Dollar", Some("DEXUSEU"), UnitType::Ratio, Some("https://fred.stlouisfed.org/series/DEXUSEU"), Some("Daily")),
        ind!("usd_jpy", "USD/JPY", SourceType::Fred, Category::Global,
             "Dollar vs Yen", Some("DEXJPUS"), UnitType::Ratio, Some("https://fred.stlouisfed.org/series/DEXJPUS"), Some("Daily")),
        ind!("usd_cny", "USD/CNY", SourceType::Fred, Category::Global,
             "Dollar vs Yuan", Some("DEXCHUS"), UnitType::Ratio, Some("https://fred.stlouisfed.org/series/DEXCHUS"), Some("Daily")),
        ind!("gbp_usd", "GBP/USD", SourceType::Fred, Category::Global,
             "Pound vs Dollar", Some("DEXUSUK"), UnitType::Ratio, Some("https://fred.stlouisfed.org/series/DEXUSUK"), Some("Daily")),

        // =====================================================================
        // TIINGO - COMMODITIES (원자재 - ETF Proxies often used if Futures not available)
        // =====================================================================
        ind!("gold", "Gold", SourceType::Tiingo, Category::Commodities,
             "Safe haven asset", Some("gld"), UnitType::UsdPrice, Some("https://www.tiingo.com/gld"), Some("Daily")),
        ind!("silver", "Silver", SourceType::Tiingo, Category::Commodities,
             "Industrial + precious metal", Some("slv"), UnitType::UsdPrice, Some("https://www.tiingo.com/slv"), Some("Daily")),
        ind!("copper", "Copper", SourceType::Tiingo, Category::Commodities,
             "Economic barometer (Dr. Copper)", Some("cper"), UnitType::UsdPrice, Some("https://www.tiingo.com/cper"), Some("Daily")),
        ind!("oil_wti", "WTI Crude Oil", SourceType::Tiingo, Category::Commodities,
             "US oil benchmark", Some("uso"), UnitType::UsdPrice, Some("https://www.tiingo.com/uso"), Some("Daily")),
        ind!("oil_brent", "Brent Crude Oil", SourceType::Tiingo, Category::Commodities,
             "Global oil benchmark", Some("bno"), UnitType::UsdPrice, Some("https://www.tiingo.com/bno"), Some("Daily")),
        ind!("natural_gas", "Natural Gas", SourceType::Tiingo, Category::Commodities,
             "Energy commodity", Some("ung"), UnitType::UsdPrice, Some("https://www.tiingo.com/ung"), Some("Daily")),

        // =====================================================================
        // TIINGO - CRYPTO (암호화폐)
        // =====================================================================
        // ind!("bitcoin", "Bitcoin (USD)", SourceType::Tiingo, Category::Crypto,
        //      "Digital gold, crypto benchmark", Some("btcusd"), UnitType::UsdPrice, Some("https://www.tiingo.com/btcusd"), Some("Daily")),
        // ind!("ethereum", "Ethereum (USD)", SourceType::Tiingo, Category::Crypto,
        //      "Smart contract platform", Some("ethusd"), UnitType::UsdPrice, Some("https://www.tiingo.com/ethusd"), Some("Daily")),
        // ind!("solana", "Solana (USD)", SourceType::Tiingo, Category::Crypto,
        //      "High-speed blockchain", Some("solusd"), UnitType::UsdPrice, Some("https://www.tiingo.com/solusd"), Some("Daily")),

        // =====================================================================
        // UPBIT - KOREA CRYPTO (한국 암호화폐)
        // =====================================================================
        // ind!("upbit_btc_krw", "Bitcoin (KRW)", SourceType::Upbit, Category::Crypto,
        //      "Bitcoin price in Korean Won", Some("KRW-BTC"), UnitType::KrwPrice, Some("https://upbit.com/exchange?code=CRIX.UPBIT.KRW-BTC"), Some("Daily")),
        // ind!("upbit_eth_krw", "Ethereum (KRW)", SourceType::Upbit, Category::Crypto,
        //      "Ethereum price in Korean Won", Some("KRW-ETH"), UnitType::KrwPrice, Some("https://upbit.com/exchange?code=CRIX.UPBIT.KRW-ETH"), Some("Daily")),
        // ind!("upbit_xrp_krw", "XRP (KRW)", SourceType::Upbit, Category::Crypto,
        //      "XRP price in Korean Won", Some("KRW-XRP"), UnitType::KrwPrice, Some("https://upbit.com/exchange?code=CRIX.UPBIT.KRW-XRP"), Some("Daily")),

        // =====================================================================
        // BINANCE - DERIVATIVES (바이낸스 파생상품) - [PAUSED] 404 Issue Investigation
        // =====================================================================
        ind!("binance_btc_usdt", "BTC/USDT (Binance)", SourceType::Binance, Category::Crypto,
             "Global BTC price benchmark", Some("BTCUSDT"), UnitType::UsdPrice, Some("https://www.binance.com/en/trade/BTC_USDT"), Some("Daily")),
        ind!("binance_eth_usdt", "ETH/USDT (Binance)", SourceType::Binance, Category::Crypto,
             "Global ETH price benchmark", Some("ETHUSDT"), UnitType::UsdPrice, Some("https://www.binance.com/en/trade/ETH_USDT"), Some("Daily")),
        ind!("binance_funding_btc", "BTC Funding Rate", SourceType::Binance, Category::Crypto,
             "Perpetual funding rate. Positive = long crowded", Some("BTCUSDT_FUNDING"), UnitType::Percent, Some("https://www.binance.com/en/trade/BTC_USDT"), Some("Daily")),
        ind!("binance_oi_btc", "BTC Open Interest", SourceType::Binance, Category::Crypto,
             "Total perpetual contracts outstanding", Some("BTCUSDT_OI"), UnitType::Dollars, Some("https://www.binance.com/en/trade/BTC_USDT"), Some("Daily")),
        ind!("binance_ls_ratio", "BTC Long/Short Ratio", SourceType::Binance, Category::Crypto,
             "Retail position ratio. Contrarian signal", Some("BTCUSDT_LS"), UnitType::Ratio, Some("https://www.binance.com/en/trade/BTC_USDT"), Some("Daily")),

        // =====================================================================
        // ALTERNATIVE DATA (대안 데이터)
        // =====================================================================
        ind!("fear_greed_index", "Fear & Greed Index", SourceType::Alternative, Category::Risk,
             "CNN sentiment gauge. 0-25 = Extreme Fear, 75-100 = Extreme Greed", None, UnitType::Index, Some("https://www.cnn.com/markets/fear-and-greed"), Some("Daily")),
        ind!("crypto_fear_greed", "Crypto Fear & Greed", SourceType::Alternative, Category::Crypto,
             "alternative.me crypto sentiment", None, UnitType::Index, Some("https://alternative.me/crypto/fear-and-greed-index/"), Some("Daily")),

        // =====================================================================
        // SECTOR ETFs (Internal - for sector rotation analysis)
        // =====================================================================
        ind!("sector_xlk", "Tech Sector (XLK)", SourceType::Tiingo, Category::Internal,
             "Technology Select Sector SPDR", Some("xlk"), UnitType::UsdPrice, Some("https://www.tiingo.com/xlk"), Some("Daily")),
        ind!("sector_xlv", "Healthcare Sector (XLV)", SourceType::Tiingo, Category::Internal,
             "Health Care Select Sector SPDR", Some("xlv"), UnitType::UsdPrice, Some("https://www.tiingo.com/xlv"), Some("Daily")),
        ind!("sector_xlf", "Financial Sector (XLF)", SourceType::Tiingo, Category::Internal,
             "Financial Select Sector SPDR", Some("xlf"), UnitType::UsdPrice, Some("https://www.tiingo.com/xlf"), Some("Daily")),
        ind!("sector_xly", "Consumer Discretionary (XLY)", SourceType::Tiingo, Category::Internal,
             "Consumer Discretionary SPDR", Some("xly"), UnitType::UsdPrice, Some("https://www.tiingo.com/xly"), Some("Daily")),
        ind!("sector_xlp", "Consumer Staples (XLP)", SourceType::Tiingo, Category::Internal,
             "Consumer Staples SPDR", Some("xlp"), UnitType::UsdPrice, Some("https://www.tiingo.com/xlp"), Some("Daily")),
        ind!("sector_xle", "Energy Sector (XLE)", SourceType::Tiingo, Category::Internal,
             "Energy Select Sector SPDR", Some("xle"), UnitType::UsdPrice, Some("https://www.tiingo.com/xle"), Some("Daily")),
        ind!("sector_xlu", "Utilities Sector (XLU)", SourceType::Tiingo, Category::Internal,
             "Utilities Select Sector SPDR", Some("xlu"), UnitType::UsdPrice, Some("https://www.tiingo.com/xlu"), Some("Daily")),
        ind!("sector_xlb", "Materials Sector (XLB)", SourceType::Tiingo, Category::Internal,
             "Materials Select Sector SPDR", Some("xlb"), UnitType::UsdPrice, Some("https://www.tiingo.com/xlb"), Some("Daily")),
        ind!("sector_xli", "Industrial Sector (XLI)", SourceType::Tiingo, Category::Internal,
             "Industrial Select Sector SPDR", Some("xli"), UnitType::UsdPrice, Some("https://www.tiingo.com/xli"), Some("Daily")),
        ind!("sector_xlre", "Real Estate Sector (XLRE)", SourceType::Tiingo, Category::Internal,
             "Real Estate Select Sector SPDR", Some("xlre"), UnitType::UsdPrice, Some("https://www.tiingo.com/xlre"), Some("Daily")),
        ind!("sector_xlc", "Communication (XLC)", SourceType::Tiingo, Category::Internal,
             "Communication Services SPDR", Some("xlc"), UnitType::UsdPrice, Some("https://www.tiingo.com/xlc"), Some("Daily")),

        // =====================================================================
        // INTERNAL/HIDDEN (계산용)
        // =====================================================================
        ind!("ncbeilq027s", "US Corporate Equities", SourceType::Fred, Category::Internal,
             "Total market cap for Buffett Indicator", Some("NCBEILQ027S"), UnitType::Billions, Some("https://fred.stlouisfed.org/series/NCBEILQ027S"), Some("Quarterly")),
        ind!("stlfsi4", "STLFSI4", SourceType::Fred, Category::Internal,
             "Financial Stress Index raw series used for internal calculations", Some("STLFSI4"), UnitType::Index, Some("https://fred.stlouisfed.org/series/STLFSI4"), Some("Weekly")),
        
        // NEW: S&P 500 PE Ratio (via Multpl Scraper)
        ind!("SP500PE12M", "S&P 500 PE Ratio", SourceType::Alternative, Category::Valuation,
             "S&P 500 Price to Earnings Ratio (Trailing 12M). Source: multpl.com", None, UnitType::Ratio, Some("https://www.multpl.com/s-p-500-pe-ratio"), Some("Monthly")),
    ]
});

/// HashMap for O(1) slug -> index lookup
static INDICATOR_MAP: Lazy<HashMap<String, usize>> = Lazy::new(|| {
    INDICATORS
        .iter()
        .enumerate()
        .map(|(idx, ind)| (ind.slug.clone(), idx))
        .collect()
});

// ============================================================================
// REGISTRY STRUCT & IMPL
// ============================================================================

pub struct Registry;

impl Registry {
    /// Get all available indicators (for UI listing)
    /// Excludes Internal category by default
    pub fn get_available_indicators() -> Vec<IndicatorMetadata> {
        INDICATORS
            .iter()
            .filter(|i| i.category != Category::Internal)
            .cloned()
            .collect()
    }

    /// Get ALL indicators including internal ones
    pub fn get_all_indicators() -> &'static Vec<IndicatorMetadata> {
        &INDICATORS
    }

    /// Get indicators by category
    pub fn get_by_category(category: Category) -> Vec<IndicatorMetadata> {
        INDICATORS
            .iter()
            .filter(|i| i.category == category)
            .cloned()
            .collect()
    }

    /// Get indicators by data source
    pub fn get_by_source(source: SourceType) -> Vec<IndicatorMetadata> {
        INDICATORS
            .iter()
            .filter(|i| i.source == source)
            .cloned()
            .collect()
    }

    /// O(1) lookup by slug
    pub fn get_metadata(slug: &str) -> Option<IndicatorMetadata> {
        INDICATOR_MAP
            .get(slug)
            .and_then(|&idx| INDICATORS.get(idx))
            .cloned()
    }

    /// Get calculator for computed indicators
    pub fn get_calculator(slug: &str) -> Option<Box<dyn CalculatedIndicator + Send + Sync>> {
        match slug {
            "buffett_indicator" => Some(Box::new(BuffettIndicator)),
            "net_liquidity" => Some(Box::new(NetLiquidity)),
            "yield_curve_10y_2y" => Some(Box::new(YieldCurve10Y2Y)),
            "yield_curve_10y_3m" => Some(Box::new(YieldCurve10Y3M)),
            "financial_stress" => Some(Box::new(FinancialStress)),
            // "kimchi_premium" => Some(Box::new(KimchiPremium)),
            "copper_gold_ratio" => Some(Box::new(CopperGoldRatio)),
            "gold_silver_ratio" => Some(Box::new(GoldSilverRatio)),
            "real_yield" => Some(Box::new(RealYield10Y)),
            "yield_gap" => Some(Box::new(YieldGap)),
            
            "cp_bill_spread" => Some(Box::new(CommercialPaperSpread)),
            "sofr_spread" => Some(Box::new(SofrSpread)),

            // TODO: Implement later
            // "rule_of_20" => Some(Box::new(RuleOf20)),
            // "equity_risk_premium" => Some(Box::new(EquityRiskPremium)),
            
            _ => None,
        }
    }

    /// Get count statistics
    pub fn get_stats() -> RegistryStats {
        let total = INDICATORS.len();
        let by_source = |s: SourceType| INDICATORS.iter().filter(|i| i.source == s).count();
        let visible = INDICATORS.iter().filter(|i| i.category != Category::Internal).count();

        RegistryStats {
            total,
            visible,
            fred: by_source(SourceType::Fred),
            tiingo: by_source(SourceType::Tiingo),
            // upbit: by_source(SourceType::Upbit),
            binance: by_source(SourceType::Binance),
            calculated: by_source(SourceType::Calculated),
            alternative: by_source(SourceType::Alternative),
            manual: by_source(SourceType::Manual),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct RegistryStats {
    pub total: usize,
    pub visible: usize,
    pub fred: usize,
    pub tiingo: usize,
    // pub upbit: usize,
    pub binance: usize,
    pub calculated: usize,
    pub alternative: usize,
    pub manual: usize,
}
