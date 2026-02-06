-- Remove Tiingo Crypto, Upbit Crypto, and Kimchi Premium
-- Transitioning to Binance-only architecture.

-- 1. Tiingo Crypto (bitcoin, ethereum, solana)
DELETE FROM historical_data 
WHERE indicator_id IN (
    SELECT id FROM indicators 
    WHERE source = 'Tiingo' 
    AND slug IN ('bitcoin', 'ethereum', 'solana')
);
DELETE FROM indicators 
WHERE source = 'Tiingo' 
AND slug IN ('bitcoin', 'ethereum', 'solana');

-- 2. Upbit Data (All Upbit source indicators)
-- Note: 'Upbit' source string might differ depending on how it was stored ("Upbit" or "UPBIT").
-- Since we removed Upbit fetcher, we should remove all data associated with it.
DELETE FROM historical_data
WHERE indicator_id IN (
    SELECT id FROM indicators
    WHERE source = 'Upbit'
);
DELETE FROM indicators WHERE source = 'Upbit';

-- 3. Kimchi Premium (Calculated)
DELETE FROM historical_data 
WHERE indicator_id IN (
    SELECT id FROM indicators 
    WHERE slug = 'kimchi_premium'
);
DELETE FROM indicators WHERE slug = 'kimchi_premium';
