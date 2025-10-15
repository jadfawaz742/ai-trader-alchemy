-- Clean up duplicate crypto models with wrong format
-- Keep only Binance USDT format (e.g., BTCUSDT, ETHUSDT)
DELETE FROM asset_models 
WHERE symbol IN (
  'BTC', 'BTC-USD', 'BTCUSD',
  'ETH', 'ETH-USD', 'ETHUSD', 
  'SOL', 'SOL-USD', 'SOLUSD',
  'ADA', 'ADA-USD', 'ADAUSD',
  'DOT', 'DOT-USD', 'DOTUSD',
  'MATIC', 'MATIC-USD', 'MATICUSD',
  'LINK', 'LINK-USD', 'LINKUSD',
  'UNI', 'UNI-USD', 'UNIUSD',
  'AVAX', 'AVAX-USD', 'AVAXUSD',
  'ATOM', 'ATOM-USD', 'ATOMUSD'
);