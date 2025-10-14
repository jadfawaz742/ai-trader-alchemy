import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { BrokerConnectionManager } from '@/components/BrokerConnectionManager';
import { AssetTypeSelector } from './AssetTypeSelector';
import { LiveTradingControls } from '@/components/LiveTradingControls';
import { PortfolioDashboard } from '@/components/PortfolioDashboard';
import { SafetyMonitorDashboard } from '@/components/SafetyMonitorDashboard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Rocket } from 'lucide-react';

export function TradingSetupDashboard() {
  const { user } = useAuth();
  const [connectedBrokers, setConnectedBrokers] = useState<string[]>([]);
  const [selectedAssetType, setSelectedAssetType] = useState<'crypto' | 'stocks' | 'both' | null>(null);

  useEffect(() => {
    loadConnectedBrokers();
  }, [user]);

  const loadConnectedBrokers = async () => {
    if (!user) return;
    
    try {
      const { data } = await supabase
        .from('broker_connections')
        .select('brokers(name)')
        .eq('user_id', user.id)
        .eq('status', 'connected');
      
      if (data) {
        setConnectedBrokers(data.map((d: any) => d.brokers.name));
      }
    } catch (error) {
      console.error('Error loading brokers:', error);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <Card className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-500/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Rocket className="h-8 w-8 text-purple-400" />
            <div>
              <CardTitle className="text-2xl text-white">Trading Setup</CardTitle>
              <CardDescription className="text-gray-300">
                Configure your brokers, select markets, and start AI-powered trading
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Step 1: Broker Connections */}
      <div>
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white mb-2">Step 1: Connect Your Brokers</h3>
          <p className="text-sm text-gray-400">Connect Binance for crypto and/or Interactive Brokers for stocks</p>
        </div>
        <BrokerConnectionManager />
      </div>

      <Separator className="bg-slate-700" />

      {/* Step 2: Asset Type Selection */}
      <AssetTypeSelector
        connectedBrokers={connectedBrokers}
        selectedType={selectedAssetType}
        onSelect={setSelectedAssetType}
      />

      {selectedAssetType && (
        <>
          <Separator className="bg-slate-700" />

          {/* Step 3: Trading Configuration */}
          <div>
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-white mb-2">Step 3: Configure Trading Parameters</h3>
              <p className="text-sm text-gray-400">Set risk levels and manage assets for live trading</p>
            </div>
            <LiveTradingControls />
          </div>

          <Separator className="bg-slate-700" />

          {/* Step 4: Monitor & Control */}
          <div>
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-white mb-2">Step 4: Monitor & Control</h3>
              <p className="text-sm text-gray-400">Track your portfolio and monitor safety systems</p>
            </div>
            <div className="grid gap-6">
              <PortfolioDashboard />
              <SafetyMonitorDashboard />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
