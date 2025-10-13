import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2, CheckCircle, XCircle, Link2, Trash2, RefreshCw } from 'lucide-react';

interface Broker {
  id: string;
  name: string;
  supports_crypto: boolean;
  supports_stocks: boolean;
  supports_futures: boolean;
}

interface BrokerConnection {
  id: string;
  broker_id: string;
  status: string;
  auth_type: string;
  encrypted_credentials: any;
  error_message: string | null;
  last_checked_at: string | null;
  created_at: string;
  brokers: Broker;
}

export function BrokerConnectionManager() {
  const { user } = useAuth();
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [connections, setConnections] = useState<BrokerConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);

  // Connection form state
  const [selectedBroker, setSelectedBroker] = useState<string>('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [accountType, setAccountType] = useState<'demo' | 'live'>('demo');

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    
    try {
      setLoading(true);

      // Load available brokers
      const { data: brokersData } = await supabase
        .from('brokers')
        .select('*')
        .order('name');

      // Load user's connections
      const { data: connectionsData } = await supabase
        .from('broker_connections')
        .select('*, brokers(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      setBrokers(brokersData || []);
      setConnections(connectionsData || []);
    } catch (error) {
      console.error('Error loading broker data:', error);
      toast.error('Failed to load broker connections');
    } finally {
      setLoading(false);
    }
  };

  const connectBroker = async () => {
    if (!selectedBroker || !apiKey || !apiSecret) {
      toast.error('Please fill in all fields');
      return;
    }

    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('connect-broker', {
        body: {
          action: 'validate',
          broker_id: selectedBroker,
          auth_type: 'api_key',
          credentials: {
            api_key: apiKey,
            api_secret: apiSecret,
            account_type: accountType,
          },
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('Broker connected successfully!');
        setApiKey('');
        setApiSecret('');
        setSelectedBroker('');
        await loadData();
      } else {
        throw new Error(data?.message || 'Failed to connect broker');
      }
    } catch (error: any) {
      console.error('Error connecting broker:', error);
      toast.error(error.message || 'Failed to connect broker');
    } finally {
      setConnecting(false);
    }
  };

  const testConnection = async (connectionId: string) => {
    setTestingConnection(connectionId);
    try {
      const connection = connections.find(c => c.id === connectionId);
      if (!connection) return;

      const { data, error } = await supabase.functions.invoke('connect-broker', {
        body: {
          action: 'validate',
          broker_id: connection.broker_id,
          auth_type: 'api_key',
          credentials: connection.encrypted_credentials,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('Connection test successful!');
        await loadData();
      } else {
        throw new Error(data?.message || 'Connection test failed');
      }
    } catch (error: any) {
      console.error('Error testing connection:', error);
      toast.error(error.message || 'Connection test failed');
    } finally {
      setTestingConnection(null);
    }
  };

  const disconnectBroker = async (connectionId: string) => {
    try {
      const connection = connections.find(c => c.id === connectionId);
      if (!connection) return;

      const { error } = await supabase.functions.invoke('connect-broker', {
        body: {
          action: 'disconnect',
          broker_id: connection.broker_id,
        },
      });

      if (error) throw error;

      toast.success('Broker disconnected');
      await loadData();
    } catch (error: any) {
      console.error('Error disconnecting broker:', error);
      toast.error('Failed to disconnect broker');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Active</Badge>;
      case 'pending':
        return <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connect New Broker */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Connect Broker
          </CardTitle>
          <CardDescription>
            Connect your brokerage account to enable live trading
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              Your credentials are encrypted and stored securely. We never have access to your funds.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div>
              <Label>Select Broker</Label>
              <Select value={selectedBroker} onValueChange={setSelectedBroker}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a broker" />
                </SelectTrigger>
                <SelectContent>
                  {brokers.map(broker => (
                    <SelectItem key={broker.id} value={broker.id}>
                      {broker.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>API Key</Label>
              <Input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key"
              />
            </div>

            <div>
              <Label>API Secret</Label>
              <Input
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="Enter your API secret"
              />
            </div>

            <div>
              <Label>Account Type</Label>
              <Select value={accountType} onValueChange={(v) => setAccountType(v as 'demo' | 'live')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="demo">Demo (Paper Trading)</SelectItem>
                  <SelectItem value="live">Live (Real Money)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={connectBroker} 
              disabled={connecting || !selectedBroker || !apiKey || !apiSecret}
              className="w-full"
            >
              {connecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Link2 className="mr-2 h-4 w-4" />
                  Connect Broker
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active Connections */}
      <Card>
        <CardHeader>
          <CardTitle>Connected Brokers</CardTitle>
          <CardDescription>
            Manage your broker connections
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connections.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No broker connections. Connect a broker to start live trading.
            </div>
          ) : (
            <div className="space-y-4">
              {connections.map(connection => (
                <div key={connection.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold">{connection.brokers.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        Connected {new Date(connection.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {getStatusBadge(connection.status)}
                  </div>

                  {connection.error_message && (
                    <Alert variant="destructive" className="mb-3">
                      <AlertDescription>{connection.error_message}</AlertDescription>
                    </Alert>
                  )}

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => testConnection(connection.id)}
                      disabled={testingConnection === connection.id}
                    >
                      {testingConnection === connection.id ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Test Connection
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => disconnectBroker(connection.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Disconnect
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
