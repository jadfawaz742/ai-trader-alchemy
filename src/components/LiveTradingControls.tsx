import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Play, Square, DollarSign, Settings2, TrendingUp } from 'lucide-react';

interface AssetPreference {
  id: string;
  asset: string;
  enabled: boolean;
  max_exposure_usd: number;
  risk_mode: string;
  broker_id: string;
}

interface BrokerConnection {
  id: string;
  brokers: {
    id: string;
    name: string;
  };
}

export function LiveTradingControls() {
  const { user } = useAuth();
  const [assetPrefs, setAssetPrefs] = useState<AssetPreference[]>([]);
  const [brokerConnections, setBrokerConnections] = useState<BrokerConnection[]>([]);
  const [activeAssets, setActiveAssets] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New asset form
  const [newAsset, setNewAsset] = useState('');
  const [newMaxExposure, setNewMaxExposure] = useState(1000);
  const [newRiskMode, setNewRiskMode] = useState<'conservative' | 'medium' | 'aggressive'>('medium');
  const [newBrokerId, setNewBrokerId] = useState('');

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Load broker connections
      const { data: connections } = await supabase
        .from('broker_connections')
        .select('id, brokers(id, name)')
        .eq('user_id', user.id)
        .eq('status', 'connected');

      // Load active models
      const { data: models } = await supabase
        .from('models')
        .select('asset')
        .eq('status', 'active');

      // Load user asset preferences
      const { data: prefs } = await supabase
        .from('user_asset_prefs')
        .select('*')
        .eq('user_id', user.id);

      setBrokerConnections(connections || []);
      setActiveAssets(models?.map(m => m.asset) || []);
      setAssetPrefs(prefs || []);

      if (connections && connections.length > 0) {
        setNewBrokerId(connections[0].id);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load trading settings');
    } finally {
      setLoading(false);
    }
  };

  const toggleAsset = async (prefId: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('user_asset_prefs')
        .update({ enabled })
        .eq('id', prefId);

      if (error) throw error;

      setAssetPrefs(prefs => 
        prefs.map(p => p.id === prefId ? { ...p, enabled } : p)
      );

      toast.success(`Trading ${enabled ? 'enabled' : 'disabled'} for asset`);
    } catch (error: any) {
      console.error('Error toggling asset:', error);
      toast.error('Failed to update asset preference');
    }
  };

  const updateExposure = async (prefId: string, maxExposure: number) => {
    try {
      const { error } = await supabase
        .from('user_asset_prefs')
        .update({ max_exposure_usd: maxExposure })
        .eq('id', prefId);

      if (error) throw error;

      setAssetPrefs(prefs =>
        prefs.map(p => p.id === prefId ? { ...p, max_exposure_usd: maxExposure } : p)
      );

      toast.success('Max exposure updated');
    } catch (error: any) {
      console.error('Error updating exposure:', error);
      toast.error('Failed to update exposure');
    }
  };

  const updateRiskMode = async (prefId: string, riskMode: 'conservative' | 'medium' | 'aggressive') => {
    try {
      const { error } = await supabase
        .from('user_asset_prefs')
        .update({ risk_mode: riskMode })
        .eq('id', prefId);

      if (error) throw error;

      setAssetPrefs(prefs =>
        prefs.map(p => p.id === prefId ? { ...p, risk_mode: riskMode } : p)
      );

      toast.success('Risk mode updated');
    } catch (error: any) {
      console.error('Error updating risk mode:', error);
      toast.error('Failed to update risk mode');
    }
  };

  const addAsset = async () => {
    if (!newAsset || !newBrokerId) {
      toast.error('Please select an asset and broker');
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('user_asset_prefs')
        .insert({
          user_id: user!.id,
          asset: newAsset,
          max_exposure_usd: newMaxExposure,
          risk_mode: newRiskMode,
          broker_id: newBrokerId,
          enabled: true
        })
        .select()
        .single();

      if (error) throw error;

      setAssetPrefs([...assetPrefs, data]);
      setNewAsset('');
      setNewMaxExposure(1000);
      setNewRiskMode('medium');
      toast.success('Asset added successfully');
    } catch (error: any) {
      console.error('Error adding asset:', error);
      toast.error('Failed to add asset');
    } finally {
      setSaving(false);
    }
  };

  const removeAsset = async (prefId: string) => {
    try {
      const { error } = await supabase
        .from('user_asset_prefs')
        .delete()
        .eq('id', prefId);

      if (error) throw error;

      setAssetPrefs(assetPrefs.filter(p => p.id !== prefId));
      toast.success('Asset removed');
    } catch (error: any) {
      console.error('Error removing asset:', error);
      toast.error('Failed to remove asset');
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  if (brokerConnections.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Live Trading Controls</CardTitle>
          <CardDescription>No broker connected</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Please connect a broker first to configure live trading.
          </p>
        </CardContent>
      </Card>
    );
  }

  const enabledCount = assetPrefs.filter(p => p.enabled).length;
  const totalExposure = assetPrefs
    .filter(p => p.enabled)
    .reduce((sum, p) => sum + p.max_exposure_usd, 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Live Trading Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="text-sm text-muted-foreground mb-1">Active Assets</div>
              <div className="text-2xl font-bold">{enabledCount}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="text-sm text-muted-foreground mb-1">Total Exposure</div>
              <div className="text-2xl font-bold">{formatCurrency(totalExposure)}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="text-sm text-muted-foreground mb-1">Available Models</div>
              <div className="text-2xl font-bold">{activeAssets.length}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="text-sm text-muted-foreground mb-1">Connected Brokers</div>
              <div className="text-2xl font-bold">{brokerConnections.length}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add New Asset */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Add Asset for Trading
          </CardTitle>
          <CardDescription>
            Enable live trading for specific assets with custom risk parameters
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Asset</Label>
              <Select value={newAsset} onValueChange={setNewAsset}>
                <SelectTrigger>
                  <SelectValue placeholder="Select asset" />
                </SelectTrigger>
                <SelectContent>
                  {activeAssets
                    .filter(a => !assetPrefs.find(p => p.asset === a))
                    .map(asset => (
                      <SelectItem key={asset} value={asset}>{asset}</SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Broker</Label>
              <Select value={newBrokerId} onValueChange={setNewBrokerId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {brokerConnections.map(conn => (
                    <SelectItem key={conn.id} value={conn.id}>
                      {conn.brokers.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Max Exposure (USD)</Label>
              <Input
                type="number"
                value={newMaxExposure}
                onChange={(e) => setNewMaxExposure(Number(e.target.value))}
                min={100}
                step={100}
              />
            </div>

            <div>
              <Label>Risk Mode</Label>
              <Select value={newRiskMode} onValueChange={(v: any) => setNewRiskMode(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conservative">Conservative</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="aggressive">Aggressive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={addAsset} disabled={saving || !newAsset} className="w-full">
            {saving ? 'Adding...' : 'Add Asset'}
          </Button>
        </CardContent>
      </Card>

      {/* Asset List */}
      <Card>
        <CardHeader>
          <CardTitle>Asset Trading Preferences</CardTitle>
          <CardDescription>
            Manage risk parameters for each asset
          </CardDescription>
        </CardHeader>
        <CardContent>
          {assetPrefs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No assets configured. Add an asset above to start trading.
            </div>
          ) : (
            <div className="space-y-4">
              {assetPrefs.map(pref => (
                <div key={pref.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-lg">{pref.asset}</h3>
                      <Badge variant={pref.enabled ? 'default' : 'secondary'}>
                        {pref.enabled ? <Play className="h-3 w-3 mr-1" /> : <Square className="h-3 w-3 mr-1" />}
                        {pref.enabled ? 'Active' : 'Paused'}
                      </Badge>
                    </div>
                    <Switch
                      checked={pref.enabled}
                      onCheckedChange={(checked) => toggleAsset(pref.id, checked)}
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label>Max Exposure</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          value={pref.max_exposure_usd}
                          onChange={(e) => updateExposure(pref.id, Number(e.target.value))}
                          min={100}
                          step={100}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateExposure(pref.id, pref.max_exposure_usd)}
                        >
                          <DollarSign className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div>
                      <Label>Risk Mode</Label>
                      <Select
                        value={pref.risk_mode}
                        onValueChange={(v: any) => updateRiskMode(pref.id, v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="conservative">Conservative</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="aggressive">Aggressive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => removeAsset(pref.id)}
                    className="mt-4"
                  >
                    Remove Asset
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
