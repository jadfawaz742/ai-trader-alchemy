import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Settings2, Shield, Bell, ArrowLeft, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface RiskParameters {
  id: string;
  max_position_size: number;
  stop_loss_percent: number;
  take_profit_percent: number;
  ppo_buy_threshold: number;
  ppo_sell_threshold: number;
  auto_trading_enabled: boolean;
  min_confidence_score: number;
  max_daily_trades: number;
}

const Settings = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [riskParams, setRiskParams] = useState<RiskParameters | null>(null);
  const [notifications, setNotifications] = useState(true);

  useEffect(() => {
    if (user) {
      fetchRiskParameters();
    }
  }, [user]);

  const fetchRiskParameters = async () => {
    try {
      const { data, error } = await supabase
        .from('risk_parameters')
        .select('*')
        .eq('user_id', user?.id)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found error
        throw error;
      }

      if (data) {
        setRiskParams(data);
      } else {
        // Create default risk parameters with a default portfolio
        const { data: portfolio } = await supabase
          .from('portfolios')
          .select('id')
          .eq('user_id', user?.id)
          .single();

        const defaultParams = {
          user_id: user?.id,
          portfolio_id: portfolio?.id || null, // This might be null if no portfolio exists
          max_position_size: 10,
          stop_loss_percent: 5,
          take_profit_percent: 15,
          ppo_buy_threshold: 0.5,
          ppo_sell_threshold: -0.5,
          auto_trading_enabled: false,
          min_confidence_score: 75,
          max_daily_trades: 10
        };

        const { data: newData, error: insertError } = await supabase
          .from('risk_parameters')
          .insert(defaultParams)
          .select()
          .single();

        if (insertError) throw insertError;
        setRiskParams(newData);
      }
    } catch (error) {
      console.error('Error fetching risk parameters:', error);
      toast({
        title: "Error",
        description: "Failed to load settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateRiskParameters = async () => {
    if (!riskParams || !user) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('risk_parameters')
        .update({
          max_position_size: riskParams.max_position_size,
          stop_loss_percent: riskParams.stop_loss_percent,
          take_profit_percent: riskParams.take_profit_percent,
          ppo_buy_threshold: riskParams.ppo_buy_threshold,
          ppo_sell_threshold: riskParams.ppo_sell_threshold,
          auto_trading_enabled: riskParams.auto_trading_enabled,
          min_confidence_score: riskParams.min_confidence_score,
          max_daily_trades: riskParams.max_daily_trades
        })
        .eq('id', riskParams.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Settings updated successfully",
      });
    } catch (error) {
      console.error('Error updating settings:', error);
      toast({
        title: "Error",
        description: "Failed to update settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      // Delete user data from custom tables first
      await supabase.from('profiles').delete().eq('id', user?.id);
      await supabase.from('portfolios').delete().eq('user_id', user?.id);
      await supabase.from('risk_parameters').delete().eq('user_id', user?.id);
      await supabase.from('stock_analysis').delete().eq('user_id', user?.id);
      await supabase.from('trades').delete().eq('user_id', user?.id);
      await supabase.from('positions').delete().eq('user_id', user?.id);

      // Sign out the user
      await signOut();

      toast({
        title: "Account Deleted",
        description: "Your account and all data have been permanently deleted",
      });
    } catch (error) {
      console.error('Error deleting account:', error);
      toast({
        title: "Error",
        description: "Failed to delete account. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Please sign in to view settings</p>
            <Link to="/auth">
              <Button className="mt-4">Sign In</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link to="/">
            <Button variant="ghost" className="text-white hover:bg-white/10">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        <div className="max-w-4xl mx-auto space-y-6">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">Settings</h1>
            <p className="text-gray-400">Configure your trading preferences and risk parameters</p>
          </div>

          {/* Trading Risk Parameters */}
          <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Shield className="h-5 w-5" />
                Risk Management
              </CardTitle>
              <CardDescription className="text-gray-400">
                Configure your trading risk parameters and limits
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {riskParams && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="max-position" className="text-white">
                      Max Position Size (%)
                    </Label>
                    <Input
                      id="max-position"
                      type="number"
                      min="1"
                      max="100"
                      value={riskParams.max_position_size}
                      onChange={(e) => setRiskParams({
                        ...riskParams,
                        max_position_size: parseFloat(e.target.value) || 0
                      })}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="stop-loss" className="text-white">
                      Stop Loss (%)
                    </Label>
                    <Input
                      id="stop-loss"
                      type="number"
                      min="1"
                      max="50"
                      value={riskParams.stop_loss_percent}
                      onChange={(e) => setRiskParams({
                        ...riskParams,
                        stop_loss_percent: parseFloat(e.target.value) || 0
                      })}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="take-profit" className="text-white">
                      Take Profit (%)
                    </Label>
                    <Input
                      id="take-profit"
                      type="number"
                      min="1"
                      max="100"
                      value={riskParams.take_profit_percent}
                      onChange={(e) => setRiskParams({
                        ...riskParams,
                        take_profit_percent: parseFloat(e.target.value) || 0
                      })}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confidence-score" className="text-white">
                      Min Confidence Score
                    </Label>
                    <Input
                      id="confidence-score"
                      type="number"
                      min="0"
                      max="100"
                      value={riskParams.min_confidence_score}
                      onChange={(e) => setRiskParams({
                        ...riskParams,
                        min_confidence_score: parseFloat(e.target.value) || 0
                      })}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="max-trades" className="text-white">
                      Max Daily Trades
                    </Label>
                    <Input
                      id="max-trades"
                      type="number"
                      min="1"
                      max="100"
                      value={riskParams.max_daily_trades}
                      onChange={(e) => setRiskParams({
                        ...riskParams,
                        max_daily_trades: parseInt(e.target.value) || 0
                      })}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="auto-trading"
                      checked={riskParams.auto_trading_enabled}
                      onCheckedChange={(checked) => setRiskParams({
                        ...riskParams,
                        auto_trading_enabled: checked
                      })}
                    />
                    <Label htmlFor="auto-trading" className="text-white">
                      Enable Auto Trading
                    </Label>
                  </div>
                </div>
              )}

              <Button onClick={updateRiskParameters} disabled={saving} className="w-full">
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Settings'
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Bell className="h-5 w-5" />
                Notifications
              </CardTitle>
              <CardDescription className="text-gray-400">
                Manage your notification preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <Switch
                  id="notifications"
                  checked={notifications}
                  onCheckedChange={setNotifications}
                />
                <Label htmlFor="notifications" className="text-white">
                  Enable trade notifications
                </Label>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-red-800 bg-red-900/20 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-400">
                <Trash2 className="h-5 w-5" />
                Danger Zone
              </CardTitle>
              <CardDescription className="text-red-300">
                Irreversible and destructive actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete your
                      account and remove all your data from our servers, including:
                      <br />• Your profile information
                      <br />• All trading history
                      <br />• Portfolio data
                      <br />• Risk parameters
                      <br />• Stock analysis results
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteAccount} className="bg-red-600 hover:bg-red-700">
                      Delete Account
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Settings;