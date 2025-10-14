import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bitcoin, TrendingUp, Rocket, CheckCircle, AlertCircle } from 'lucide-react';

interface AssetTypeSelectorProps {
  connectedBrokers: string[];
  selectedType: 'crypto' | 'stocks' | 'both' | null;
  onSelect: (type: 'crypto' | 'stocks' | 'both') => void;
}

export function AssetTypeSelector({ connectedBrokers, selectedType, onSelect }: AssetTypeSelectorProps) {
  const hasBinance = connectedBrokers.some(b => b.toLowerCase().includes('binance'));
  const hasIB = connectedBrokers.some(b => b.toLowerCase().includes('interactive'));

  const options = [
    {
      type: 'crypto' as const,
      title: 'Crypto Only',
      icon: Bitcoin,
      description: 'Trade cryptocurrencies exclusively',
      requirements: 'Requires Binance',
      enabled: hasBinance,
      color: 'text-orange-500'
    },
    {
      type: 'stocks' as const,
      title: 'Stocks Only',
      icon: TrendingUp,
      description: 'Trade stocks and equities',
      requirements: 'Requires Interactive Brokers',
      enabled: hasIB,
      color: 'text-blue-500'
    },
    {
      type: 'both' as const,
      title: 'Crypto + Stocks',
      icon: Rocket,
      description: 'Trade both markets in parallel',
      requirements: 'Requires both brokers',
      enabled: hasBinance && hasIB,
      color: 'text-purple-500'
    }
  ];

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white mb-2">Step 2: Choose Your Trading Style</h3>
        <p className="text-sm text-gray-400">Select which markets you want the AI to trade</p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {options.map(option => {
          const Icon = option.icon;
          const isSelected = selectedType === option.type;
          
          return (
            <Card
              key={option.type}
              className={`cursor-pointer transition-all border-2 ${
                isSelected 
                  ? 'border-purple-500 bg-purple-500/10' 
                  : option.enabled 
                    ? 'border-slate-700 hover:border-slate-600 bg-slate-800/50' 
                    : 'border-slate-800 bg-slate-900/30 opacity-60 cursor-not-allowed'
              }`}
              onClick={() => option.enabled && onSelect(option.type)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <Icon className={`h-8 w-8 ${option.color}`} />
                  {option.enabled ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                  )}
                </div>
                <CardTitle className="text-white">{option.title}</CardTitle>
                <CardDescription className="text-gray-400">
                  {option.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Badge variant={option.enabled ? 'default' : 'secondary'} className="text-xs">
                  {option.requirements}
                </Badge>
                {!option.enabled && (
                  <p className="text-xs text-yellow-500 mt-2">Connect required broker(s) first</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
