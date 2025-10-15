import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Search, TrendingUp, TrendingDown, Activity, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

// Stock symbols to fetch - no hardcoded prices
const STOCK_SYMBOLS = [
  // Large Cap - PPO Training Stocks
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', cap: 'Large' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology', cap: 'Large' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology', cap: 'Large' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'E-commerce', cap: 'Large' },
  { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'Automotive', cap: 'Large' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology', cap: 'Large' },
  { symbol: 'META', name: 'Meta Platforms Inc.', sector: 'Social Media', cap: 'Large' },
  { symbol: 'NFLX', name: 'Netflix Inc.', sector: 'Entertainment', cap: 'Large' },
  
  // Additional PPO Training Stocks - Major Financials & Healthcare
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'Financial', cap: 'Large' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare', cap: 'Large' },
  { symbol: 'PG', name: 'Procter & Gamble Co.', sector: 'Consumer Goods', cap: 'Large' },
  { symbol: 'V', name: 'Visa Inc.', sector: 'Financial', cap: 'Large' },
  { symbol: 'WMT', name: 'Walmart Inc.', sector: 'Retail', cap: 'Large' },
  { symbol: 'UNH', name: 'UnitedHealth Group', sector: 'Healthcare', cap: 'Large' },
  { symbol: 'HD', name: 'The Home Depot Inc.', sector: 'Retail', cap: 'Large' },
  
  // ETFs - PPO Training Assets
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', sector: 'ETF', cap: 'Large' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', sector: 'ETF', cap: 'Large' },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF', sector: 'ETF', cap: 'Medium' },
  { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', sector: 'ETF', cap: 'Large' },
  
  // Cryptocurrencies - PPO Training Assets (Binance format)
  { symbol: 'BTCUSDT', name: 'Bitcoin', sector: 'Crypto', cap: 'Large' },
  { symbol: 'ETHUSDT', name: 'Ethereum', sector: 'Crypto', cap: 'Large' },
  { symbol: 'SOLUSDT', name: 'Solana', sector: 'Crypto', cap: 'Medium' },
  { symbol: 'ADAUSDT', name: 'Cardano', sector: 'Crypto', cap: 'Medium' },
  { symbol: 'DOTUSDT', name: 'Polkadot', sector: 'Crypto', cap: 'Medium' },
  
  // Additional Medium Cap Stocks
  { symbol: 'SHOP', name: 'Shopify Inc.', sector: 'E-commerce', cap: 'Medium' },
  { symbol: 'TWLO', name: 'Twilio Inc.', sector: 'Technology', cap: 'Medium' },
  { symbol: 'ROKU', name: 'Roku Inc.', sector: 'Entertainment', cap: 'Medium' },
  { symbol: 'CRWD', name: 'CrowdStrike Holdings', sector: 'Cybersecurity', cap: 'Medium' },
  { symbol: 'OKTA', name: 'Okta Inc.', sector: 'Technology', cap: 'Medium' },
  { symbol: 'DDOG', name: 'Datadog Inc.', sector: 'Technology', cap: 'Medium' },
  { symbol: 'NET', name: 'Cloudflare Inc.', sector: 'Technology', cap: 'Medium' },
  { symbol: 'PLTR', name: 'Palantir Technologies', sector: 'Technology', cap: 'Medium' },
  
  // Small Cap & Emerging
  { symbol: 'RBLX', name: 'Roblox Corporation', sector: 'Gaming', cap: 'Small' },
  { symbol: 'UPST', name: 'Upstart Holdings', sector: 'Fintech', cap: 'Small' },
  { symbol: 'HOOD', name: 'Robinhood Markets', sector: 'Fintech', cap: 'Small' },
  { symbol: 'COIN', name: 'Coinbase Global', sector: 'Crypto', cap: 'Small' },
  { symbol: 'RIVN', name: 'Rivian Automotive', sector: 'EV', cap: 'Small' },
  { symbol: 'LCID', name: 'Lucid Group Inc.', sector: 'EV', cap: 'Small' },
  { symbol: 'SOFI', name: 'SoFi Technologies', sector: 'Fintech', cap: 'Small' },
  { symbol: 'WISH', name: 'ContextLogic Inc.', sector: 'E-commerce', cap: 'Small' },
];

const StocksPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSector, setSelectedSector] = useState<string>('All');
  const [selectedCap, setSelectedCap] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'symbol' | 'price' | 'change' | 'volume'>('symbol');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [stockPrices, setStockPrices] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [trainedAssets, setTrainedAssets] = useState<string[]>([]);
  const [allSymbols, setAllSymbols] = useState(STOCK_SYMBOLS);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  // Helper to normalize crypto symbols to Binance USDT format
  const normalizeCryptoSymbol = (symbol: string): string => {
    const upper = symbol.trim().toUpperCase();
    
    // Known crypto bases
    const cryptoBases = ['BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'MATIC', 'LINK', 'UNI', 'AVAX', 'ATOM'];
    
    // If it's a known crypto without suffix, add USDT
    if (cryptoBases.includes(upper)) {
      return `${upper}USDT`;
    }
    
    // Convert Yahoo Finance format (BTC-USD) to Binance (BTCUSDT)
    if (upper.includes('-USD')) {
      return upper.replace('-USD', 'USDT');
    }
    
    // Convert old format (BTCUSD) to Binance (BTCUSDT)
    if (upper.endsWith('USD') && !upper.endsWith('USDT')) {
      return upper.replace(/USD$/, 'USDT');
    }
    
    return upper;
  };

  useEffect(() => {
    const fetchTrainedAssets = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase
          .from('asset_models')
          .select('symbol')
          .eq('user_id', user.id);
        
        if (error) throw error;
        
        // Normalize and deduplicate symbols
        const normalizedSymbols = [...new Set(
          (data?.map(d => normalizeCryptoSymbol(d.symbol)) || [])
            .filter(s => !s.includes('-USD') && !s.match(/^(BTC|ETH|SOL|ADA|DOT|MATIC|LINK|UNI|AVAX|ATOM)$/))
        )];
        
        setTrainedAssets(normalizedSymbols);
        
        // Merge trained assets with static list
        const trainedNotInList = normalizedSymbols.filter(
          symbol => !STOCK_SYMBOLS.find(s => s.symbol === symbol)
        );
        
        const newSymbols = trainedNotInList.map(symbol => ({
          symbol,
          name: symbol,
          sector: 'Trained',
          cap: 'Medium' as const
        }));
        
        if (newSymbols.length > 0) {
          setAllSymbols([...STOCK_SYMBOLS, ...newSymbols]);
        }
      } catch (error) {
        console.error('Error fetching trained assets:', error);
      }
    };
    
    fetchTrainedAssets();
  }, [user]);

  useEffect(() => {
    const fetchRealPrices = async () => {
      setIsLoading(true);
      const priceData: Record<string, any> = {};
      
      // Separate stocks and crypto
      const stocks = allSymbols.filter(s => s.sector !== 'Crypto');
      const cryptos = allSymbols.filter(s => s.sector === 'Crypto');
      
      // Fetch crypto prices from Bybit
      try {
        const { data: cryptoData } = await supabase.functions.invoke('fetch-crypto-prices');
        if (cryptoData?.prices) {
          cryptoData.prices.forEach((crypto: any) => {
            // Use the symbol as-is (already in correct USDT format from API)
            const cryptoSymbol = crypto.symbol.includes('USDT') ? crypto.symbol : `${crypto.symbol}USDT`;
            priceData[cryptoSymbol] = {
              price: crypto.price,
              change: crypto.price * (crypto.change24h / 100),
              changePercent: crypto.change24h,
              volume: crypto.volume24h,
              high: crypto.high24h,
              low: crypto.low24h,
            };
          });
        }
      } catch (error) {
        console.error('Error fetching crypto prices:', error);
      }
      
      // Fetch stock prices from Yahoo Finance
      for (const stock of stocks) {
        try {
          const { data, error } = await supabase.functions.invoke('fetch-stock-price', {
            body: { symbol: stock.symbol }
          });
          
          if (!error && data && !data.error) {
            priceData[stock.symbol] = data;
          }
          
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
          console.error(`Error fetching ${stock.symbol}:`, error);
        }
      }
      
      setStockPrices(priceData);
      setIsLoading(false);
    };
    
    fetchRealPrices();
  }, [allSymbols]);

  const sectors = ['All', 'Trained Models', ...Array.from(new Set(allSymbols.map(stock => stock.sector)))];
  const caps = ['All', 'Large', 'Medium', 'Small'];

  const filteredAndSortedStocks = allSymbols
    .map(stock => {
      // Only show stocks with real data from Yahoo Finance or Bybit
      const realData = stockPrices[stock.symbol];
      if (realData && !realData.error) {
        return {
          ...stock,
          price: realData.price,
          change: realData.change,
          changePercent: realData.changePercent,
          volume: realData.volume,
        };
      }
      return null;
    })
    .filter(stock => stock !== null)
    .filter(stock => {
      const matchesSearch = stock.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           stock.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSector = selectedSector === 'All' || 
                           (selectedSector === 'Trained Models' && trainedAssets.includes(stock.symbol)) ||
                           stock.sector === selectedSector;
      const matchesCap = selectedCap === 'All' || stock.cap === selectedCap;
      
      return matchesSearch && matchesSector && matchesCap;
    })
    .sort((a, b) => {
      let aVal, bVal;
      
      switch (sortBy) {
        case 'price':
          aVal = a.price;
          bVal = b.price;
          break;
        case 'change':
          aVal = a.changePercent;
          bVal = b.changePercent;
          break;
        case 'volume':
          aVal = a.volume;
          bVal = b.volume;
          break;
        default:
          aVal = a.symbol;
          bVal = b.symbol;
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(1)}M`;
    } else if (volume >= 1000) {
      return `${(volume / 1000).toFixed(1)}K`;
    }
    return volume.toString();
  };

  const handleSort = (newSortBy: typeof sortBy) => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('asc');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="outline" asChild>
              <Link to="/">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Link>
            </Button>
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Stock Market</h1>
              <p className="text-gray-300">Browse and analyze available stocks</p>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Market Overview</CardTitle>
              {isLoading && (
                <Badge variant="secondary" className="animate-pulse">
                  Loading real prices...
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search stocks by symbol or company name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <div className="flex gap-4 flex-wrap">
                <div className="flex gap-2">
                  <span className="text-sm text-muted-foreground self-center">Sector:</span>
                  {sectors.map(sector => (
                    <Button
                      key={sector}
                      variant={selectedSector === sector ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedSector(sector)}
                    >
                      {sector}
                    </Button>
                  ))}
                </div>
                
                <div className="flex gap-2">
                  <span className="text-sm text-muted-foreground self-center">Market Cap:</span>
                  {caps.map(cap => (
                    <Button
                      key={cap}
                      variant={selectedCap === cap ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCap(cap)}
                    >
                      {cap}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <span className="text-sm text-muted-foreground self-center">Sort by:</span>
                {[
                  { key: 'symbol', label: 'Symbol' },
                  { key: 'price', label: 'Price' },
                  { key: 'change', label: 'Change %' },
                  { key: 'volume', label: 'Volume' }
                ].map(({ key, label }) => (
                  <Button
                    key={key}
                    variant={sortBy === key ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleSort(key as typeof sortBy)}
                  >
                    {label}
                    {sortBy === key && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stock Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAndSortedStocks.map(stock => {
            const hasRealData = stockPrices[stock.symbol] && !stockPrices[stock.symbol].error;
            return (
              <Card 
                key={stock.symbol} 
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/stocks/${stock.symbol}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                  <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-lg font-mono">{stock.symbol}</CardTitle>
                        {hasRealData && (
                          <Badge variant="secondary" className="text-xs">Live</Badge>
                        )}
                        {trainedAssets.includes(stock.symbol) && (
                          <Badge className="text-xs bg-emerald-500 hover:bg-emerald-600">
                            🤖 Trained
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{stock.name}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {stock.cap}
                    </Badge>
                  </div>
                </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-2xl font-bold">
                    {formatCurrency(stock.price)}
                  </div>
                  <div className={`flex items-center gap-1 text-sm font-medium ${
                    stock.change >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}>
                    {stock.change >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}
                  </div>
                  <div className="flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    {formatVolume(stock.volume)}
                  </div>
                </div>
                
                <div className="pt-2 border-t">
                  <Badge variant="secondary" className="text-xs">
                    {stock.sector}
                  </Badge>
                </div>
                
                <Button className="w-full" size="sm">
                  View Details & Chart
                </Button>
              </CardContent>
            </Card>
          );
          })}
        </div>

        {filteredAndSortedStocks.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No stocks found</h3>
              <p className="text-muted-foreground">Try adjusting your search criteria</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default StocksPage;