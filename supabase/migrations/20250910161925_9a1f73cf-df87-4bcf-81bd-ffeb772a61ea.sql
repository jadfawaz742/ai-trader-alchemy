-- Reset all portfolios to starting balance and clear all positions and trades
UPDATE portfolios SET current_balance = initial_balance, total_pnl = 0, updated_at = NOW();

-- Delete all positions to start fresh
DELETE FROM positions;

-- Delete all trades to start fresh
DELETE FROM trades;