import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Plus, Minus, TrendingUp } from 'lucide-react';

// Comprehensive stock list from various sectors
const AVAILABLE_STOCKS = [
  // Large Cap
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', cap: 'Large' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology', cap: 'Large' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology', cap: 'Large' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'E-commerce', cap: 'Large' },
  { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'Automotive', cap: 'Large' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology', cap: 'Large' },
  { symbol: 'META', name: 'Meta Platforms Inc.', sector: 'Social Media', cap: 'Large' },
  { symbol: 'NFLX', name: 'Netflix Inc.', sector: 'Entertainment', cap: 'Large' },
  
  // Medium Cap
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
  
  // Traditional Markets
  { symbol: 'JPM', name: 'JPMorgan Chase', sector: 'Banking', cap: 'Large' },
  { symbol: 'BAC', name: 'Bank of America', sector: 'Banking', cap: 'Large' },
  { symbol: 'WMT', name: 'Walmart Inc.', sector: 'Retail', cap: 'Large' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare', cap: 'Large' },
  { symbol: 'PFE', name: 'Pfizer Inc.', sector: 'Pharmaceuticals', cap: 'Large' },
  { symbol: 'XOM', name: 'Exxon Mobil', sector: 'Energy', cap: 'Large' },
];

interface StockSelectorProps {
  selectedStocks: string[];
  onSelectionChange: (stocks: string[]) => void;
  maxSelection?: number;
  title?: string;
  description?: string;
}

export const StockSelector: React.FC<StockSelectorProps> = ({
  selectedStocks,
  onSelectionChange,
  maxSelection = 10,
  title = "Select Stocks for Trading",
  description = "Choose which stocks to include in your trading portfolio"
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSector, setSelectedSector] = useState<string>('All');
  const [selectedCap, setSelectedCap] = useState<string>('All');

  const sectors = ['All', ...Array.from(new Set(AVAILABLE_STOCKS.map(stock => stock.sector)))];
  const caps = ['All', 'Large', 'Medium', 'Small'];

  const filteredStocks = AVAILABLE_STOCKS.filter(stock => {
    const matchesSearch = stock.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         stock.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSector = selectedSector === 'All' || stock.sector === selectedSector;
    const matchesCap = selectedCap === 'All' || stock.cap === selectedCap;
    
    return matchesSearch && matchesSector && matchesCap;
  });

  const handleStockToggle = (symbol: string) => {
    const isSelected = selectedStocks.includes(symbol);
    
    if (isSelected) {
      onSelectionChange(selectedStocks.filter(s => s !== symbol));
    } else if (selectedStocks.length < maxSelection) {
      onSelectionChange([...selectedStocks, symbol]);
    }
  };

  const selectAll = () => {
    const availableSymbols = filteredStocks.slice(0, maxSelection).map(stock => stock.symbol);
    onSelectionChange([...new Set([...selectedStocks, ...availableSymbols])].slice(0, maxSelection));
  };

  const clearAll = () => {
    onSelectionChange([]);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {title}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {description} (Selected: {selectedStocks.length}/{maxSelection})
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              <Plus className="h-4 w-4 mr-1" />
              Select Visible
            </Button>
            <Button variant="outline" size="sm" onClick={clearAll}>
              <Minus className="h-4 w-4 mr-1" />
              Clear All
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search and Filters */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search stocks by symbol or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex gap-2 flex-wrap">
            <div className="flex gap-1">
              <Label className="text-xs text-muted-foreground">Sector:</Label>
              {sectors.slice(0, 5).map(sector => (
                <Button
                  key={sector}
                  variant={selectedSector === sector ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedSector(sector)}
                  className="text-xs h-7"
                >
                  {sector}
                </Button>
              ))}
            </div>
            
            <div className="flex gap-1">
              <Label className="text-xs text-muted-foreground">Cap:</Label>
              {caps.map(cap => (
                <Button
                  key={cap}
                  variant={selectedCap === cap ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCap(cap)}
                  className="text-xs h-7"
                >
                  {cap}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Selected Stocks Summary */}
        {selectedStocks.length > 0 && (
          <div className="p-3 bg-muted rounded-lg">
            <Label className="text-sm font-medium mb-2 block">Selected Stocks:</Label>
            <div className="flex flex-wrap gap-1">
              {selectedStocks.map(symbol => (
                <Badge key={symbol} variant="secondary" className="text-xs">
                  {symbol}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 ml-1 hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => handleStockToggle(symbol)}
                  >
                    ×
                  </Button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Stock List */}
        <ScrollArea className="h-[400px] w-full">
          <div className="space-y-2">
            {filteredStocks.map(stock => {
              const isSelected = selectedStocks.includes(stock.symbol);
              const isMaxReached = selectedStocks.length >= maxSelection && !isSelected;
              
              return (
                <div
                  key={stock.symbol}
                  className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors ${
                    isSelected ? 'bg-primary/5 border-primary' : 'hover:bg-muted'
                  } ${isMaxReached ? 'opacity-50' : ''}`}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => !isMaxReached && handleStockToggle(stock.symbol)}
                    disabled={isMaxReached}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm">{stock.symbol}</span>
                      <Badge variant="outline" className="text-xs">
                        {stock.cap}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{stock.name}</p>
                    <p className="text-xs text-muted-foreground">{stock.sector}</p>
                  </div>
                </div>
              );
            })}
            
            {filteredStocks.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No stocks found matching your criteria</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default StockSelector;