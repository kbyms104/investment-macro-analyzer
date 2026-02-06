-- Migration: Yahoo to Tiingo
-- Date: 2026-02-05

-- 1. Update source column in indicators table
UPDATE indicators 
SET source = 'Tiingo' 
WHERE source = 'Yahoo';

-- 2. Update metadata in historical_data (if it contains 'Yahoo')
-- SQLite doesn't have a simple REGEX replace, but strict string replace works if the format is consistent.
UPDATE historical_data 
SET metadata = REPLACE(metadata, 'Yahoo', 'Tiingo') 
WHERE metadata LIKE '%Yahoo%';
