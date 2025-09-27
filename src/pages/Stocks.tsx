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

// Enhanced stock data with PPO training symbols included
const STOCK_DATA = [
  // Large Cap - PPO Training Stocks
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', cap: 'Large', price: 175.43, change: 2.34, changePercent: 1.35, volume: 45234567 },
  { symbol: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology', cap: 'Large', price: 334.89, change: -1.23, changePercent: -0.37, volume: 23456789 },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology', cap: 'Large', price: 138.21, change: 3.45, changePercent: 2.56, volume: 34567890 },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'E-commerce', cap: 'Large', price: 127.89, change: -2.11, changePercent: -1.62, volume: 56789012 },
  { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'Automotive', cap: 'Large', price: 242.67, change: 8.94, changePercent: 3.83, volume: 78901234 },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology', cap: 'Large', price: 876.54, change: 12.34, changePercent: 1.43, volume: 12345678 },
  { symbol: 'META', name: 'Meta Platforms Inc.', sector: 'Social Media', cap: 'Large', price: 298.76, change: -4.56, changePercent: -1.51, volume: 23456789 },
  { symbol: 'NFLX', name: 'Netflix Inc.', sector: 'Entertainment', cap: 'Large', price: 456.78, change: 7.89, changePercent: 1.76, volume: 34567890 },
  
  // Additional PPO Training Stocks - Major Financials & Healthcare
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'Financial', cap: 'Large', price: 148.52, change: 1.87, changePercent: 1.28, volume: 12345678 },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare', cap: 'Large', price: 162.34, change: -0.45, changePercent: -0.28, volume: 8765432 },
  { symbol: 'PG', name: 'Procter & Gamble Co.', sector: 'Consumer Goods', cap: 'Large', price: 155.67, change: 0.78, changePercent: 0.50, volume: 6543210 },
  { symbol: 'V', name: 'Visa Inc.', sector: 'Financial', cap: 'Large', price: 258.91, change: 3.21, changePercent: 1.26, volume: 9876543 },
  { symbol: 'WMT', name: 'Walmart Inc.', sector: 'Retail', cap: 'Large', price: 159.84, change: -1.12, changePercent: -0.70, volume: 11223344 },
  { symbol: 'UNH', name: 'UnitedHealth Group', sector: 'Healthcare', cap: 'Large', price: 547.23, change: 4.67, changePercent: 0.86, volume: 3456789 },
  { symbol: 'HD', name: 'The Home Depot Inc.', sector: 'Retail', cap: 'Large', price: 334.45, change: 2.89, changePercent: 0.87, volume: 7890123 },
  
  // ETFs - PPO Training Assets
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', sector: 'ETF', cap: 'Large', price: 445.67, change: 2.34, changePercent: 0.53, volume: 87654321 },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', sector: 'ETF', cap: 'Large', price: 378.92, change: 1.87, changePercent: 0.50, volume: 56789012 },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF', sector: 'ETF', cap: 'Medium', price: 194.56, change: -0.89, changePercent: -0.46, volume: 23456789 },
  { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', sector: 'ETF', cap: 'Large', price: 243.78, change: 1.23, changePercent: 0.51, volume: 12345678 },
  
  // Cryptocurrencies - PPO Training Assets
  { symbol: 'BTCUSD', name: 'Bitcoin', sector: 'Crypto', cap: 'Large', price: 43287.65, change: 1234.56, changePercent: 2.94, volume: 1234567890 },
  { symbol: 'ETHUSD', name: 'Ethereum', sector: 'Crypto', cap: 'Large', price: 2456.78, change: -87.32, changePercent: -3.43, volume: 567890123 },
  { symbol: 'SOLUSDT', name: 'Solana', sector: 'Crypto', cap: 'Medium', price: 98.45, change: 4.32, changePercent: 4.59, volume: 234567890 },
  { symbol: 'ADAUSDT', name: 'Cardano', sector: 'Crypto', cap: 'Medium', price: 0.387, change: -0.023, changePercent: -5.61, volume: 789012345 },
  { symbol: 'DOTUSDT', name: 'Polkadot', sector: 'Crypto', cap: 'Medium', price: 6.78, change: 0.34, changePercent: 5.28, volume: 345678901 },
  
  // Additional Medium Cap Stocks
  { symbol: 'SHOP', name: 'Shopify Inc.', sector: 'E-commerce', cap: 'Medium', price: 78.92, change: 1.23, changePercent: 1.58, volume: 4567890 },
  { symbol: 'TWLO', name: 'Twilio Inc.', sector: 'Technology', cap: 'Medium', price: 67.45, change: -0.98, changePercent: -1.43, volume: 5678901 },
  { symbol: 'ROKU', name: 'Roku Inc.', sector: 'Entertainment', cap: 'Medium', price: 89.34, change: 2.76, changePercent: 3.19, volume: 6789012 },
  { symbol: 'CRWD', name: 'CrowdStrike Holdings', sector: 'Cybersecurity', cap: 'Medium', price: 234.56, change: -3.21, changePercent: -1.35, volume: 7890123 },
  { symbol: 'OKTA', name: 'Okta Inc.', sector: 'Technology', cap: 'Medium', price: 123.45, change: 4.32, changePercent: 3.63, volume: 8901234 },
  { symbol: 'DDOG', name: 'Datadog Inc.', sector: 'Technology', cap: 'Medium', price: 156.78, change: 1.87, changePercent: 1.21, volume: 9012345 },
  { symbol: 'NET', name: 'Cloudflare Inc.', sector: 'Technology', cap: 'Medium', price: 87.65, change: -1.54, changePercent: -1.73, volume: 1234567 },
  { symbol: 'PLTR', name: 'Palantir Technologies', sector: 'Technology', cap: 'Medium', price: 23.45, change: 0.67, changePercent: 2.94, volume: 2345678 },
  
  // Small Cap & Emerging
  { symbol: 'RBLX', name: 'Roblox Corporation', sector: 'Gaming', cap: 'Small', price: 45.67, change: 1.23, changePercent: 2.77, volume: 3456789 },
  { symbol: 'UPST', name: 'Upstart Holdings', sector: 'Fintech', cap: 'Small', price: 34.89, change: -2.11, changePercent: -5.70, volume: 4567890 },
  { symbol: 'HOOD', name: 'Robinhood Markets', sector: 'Fintech', cap: 'Small', price: 12.34, change: 0.45, changePercent: 3.78, volume: 5678901 },
  { symbol: 'COIN', name: 'Coinbase Global', sector: 'Crypto', cap: 'Small', price: 167.89, change: -8.76, changePercent: -4.96, volume: 6789012 },
  { symbol: 'RIVN', name: 'Rivian Automotive', sector: 'EV', cap: 'Small', price: 18.76, change: 1.34, changePercent: 7.69, volume: 7890123 },
  { symbol: 'LCID', name: 'Lucid Group Inc.', sector: 'EV', cap: 'Small', price: 3.45, change: -0.12, changePercent: -3.36, volume: 8901234 },
  { symbol: 'SOFI', name: 'SoFi Technologies', sector: 'Fintech', cap: 'Small', price: 9.87, change: 0.23, changePercent: 2.39, volume: 9012345 },
  { symbol: 'WISH', name: 'ContextLogic Inc.', sector: 'E-commerce', cap: 'Small', price: 1.23, change: -0.05, changePercent: -3.91, volume: 1234567 },
];

const StocksPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSector, setSelectedSector] = useState<string>('All');
  const [selectedCap, setSelectedCap] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'symbol' | 'price' | 'change' | 'volume'>('symbol');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const navigate = useNavigate();
  const { toast } = useToast();

  const sectors = ['All', ...Array.from(new Set(STOCK_DATA.map(stock => stock.sector)))];
  const caps = ['All', 'Large', 'Medium', 'Small'];

  const filteredAndSortedStocks = STOCK_DATA
    .filter(stock => {
      const matchesSearch = stock.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           stock.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSector = selectedSector === 'All' || stock.sector === selectedSector;
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
            <CardTitle>Market Overview</CardTitle>
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
          {filteredAndSortedStocks.map(stock => (
            <Card 
              key={stock.symbol} 
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => navigate(`/stocks/${stock.symbol}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-mono">{stock.symbol}</CardTitle>
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
          ))}
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