
/**
 * UnitType enum matching backend registry.rs
 * Used for proper value formatting based on indicator metadata
 */
export type UnitType =
    | "Index"      // Raw value (e.g., VIX 15.00, Case-Shiller 328.44)
    | "Percent"    // Percentage (e.g., 4.26%)
    | "UsdPrice"   // USD Price (e.g., $2,750.50)
    | "KrwPrice"   // KRW Price (e.g., ₩150,000)
    | "Billions"   // Value is already in Billions (e.g., FRED GDP 28000 = $28T)
    | "Millions"   // Value is already in Millions (e.g., FRED WALCL 7000000 = $7T)
    | "Thousands"  // Value is already in Thousands (e.g., FRED NFP)
    | "Dollars"    // Raw USD value, auto-convert to T/B/M
    | "Ratio";     // Simple ratio (e.g., 1.85)

/**
 * Format a value based on the unit type from backend metadata
 * This is the NEW primary formatting function
 */
export function formatValueByUnit(value: number, unit: UnitType): string {
    if (value === null || value === undefined || isNaN(value)) return "--";

    switch (unit) {
        case "Index":
            // Pure index value, show with comma separation
            return value.toLocaleString(undefined, { maximumFractionDigits: 2 });

        case "Percent":
            return value.toFixed(2) + "%";

        case "UsdPrice":
            return "$" + value.toLocaleString(undefined, { maximumFractionDigits: 2 });

        case "KrwPrice":
            return "₩" + value.toLocaleString(undefined, { maximumFractionDigits: 0 });

        case "Billions":
            // Value is already in Billions. Convert to T if >= 1000B
            if (Math.abs(value) >= 1000) {
                return "$" + (value / 1000).toFixed(2) + "T";
            }
            return "$" + value.toFixed(2) + "B";

        case "Millions":
            // Value is already in Millions. Convert appropriately
            if (Math.abs(value) >= 1_000_000) {
                return "$" + (value / 1_000_000).toFixed(2) + "T";
            }
            if (Math.abs(value) >= 1000) {
                return "$" + (value / 1000).toFixed(2) + "B";
            }
            return "$" + value.toFixed(2) + "M";

        case "Thousands":
            // Value is already in Thousands.
            if (Math.abs(value) >= 1_000_000_000) {
                return (value / 1_000_000_000).toFixed(2) + "T";
            }
            if (Math.abs(value) >= 1_000_000) {
                return (value / 1_000_000).toFixed(2) + "B";
            }
            if (Math.abs(value) >= 1000) {
                return (value / 1000).toFixed(2) + "M";
            }
            return value.toLocaleString(undefined, { maximumFractionDigits: 0 }) + "K";

        case "Dollars":
            // Raw USD value - use formatLargeNumber for auto T/B/M conversion
            return formatLargeNumber(value, "$");

        case "Ratio":
            return value.toFixed(3);

        default:
            return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
}

/**
 * Legacy formatter - kept for backward compatibility
 * Use formatValueByUnit with proper unit type when possible
 */
export function formatLargeNumber(value: number, currency = ""): string {
    if (value === null || value === undefined) return "--";

    const absValue = Math.abs(value);
    const sign = value < 0 ? "-" : "";

    if (absValue >= 1_000_000_000_000) {
        return `${sign}${currency}${(absValue / 1_000_000_000_000).toFixed(2)}T`;
    }
    if (absValue >= 1_000_000_000) {
        return `${sign}${currency}${(absValue / 1_000_000_000).toFixed(2)}B`;
    }
    if (absValue >= 1_000_000) {
        return `${sign}${currency}${(absValue / 1_000_000).toFixed(2)}M`;
    }
    if (absValue >= 10_000) {
        return `${sign}${currency}${(absValue / 1_000).toFixed(2)}K`;
    }

    return `${sign}${currency}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/**
 * Formats an indicator value based on metadata.
 * Now primarily uses the 'unit' provided from backend registry.
 */
export function formatIndicatorValue(value: number, category: string, unit?: UnitType): string {
    if (value === null || value === undefined) return "--";

    // 1. Source of Truth: Backend Registry Unit
    if (unit) {
        return formatValueByUnit(value, unit);
    }

    // 2. Minimal Fallbacks for robustness
    if (category === "Crypto") {
        return formatValueByUnit(value, "UsdPrice");
    }

    if (category === "KoreaStocks" || category === "KoreaMacro") {
        return formatValueByUnit(value, "KrwPrice");
    }

    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
