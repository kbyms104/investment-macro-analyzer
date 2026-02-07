-- Revert Indices from Tiingo to Yahoo
-- Delete existing data for indices that were switched to Tiingo but are now back to Yahoo
-- This ensures no mixed data (Index vs ETF)

DELETE FROM historical_data 
WHERE indicator_id IN (
    SELECT id FROM indicators 
    WHERE slug IN (
        'spx', 'ndx', 'djia', 'russell_2000', 
        'nikkei', 'shanghai', 'hang_seng', 'dax', 'ftse', 'euro_stoxx', 
        'vxn'
    )
);

-- Force update source in DB to avoid confusion (though Registry sync will do this too)
UPDATE indicators
SET source = 'Yahoo'
WHERE slug IN (
    'spx', 'ndx', 'djia', 'russell_2000', 
    'nikkei', 'shanghai', 'hang_seng', 'dax', 'ftse', 'euro_stoxx', 
    'vxn'
);
