import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Flag, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface FeatureFlagManagerProps {
  adminData: any;
  onUpdate: () => void;
}

export const FeatureFlagManager = ({ adminData, onUpdate }: FeatureFlagManagerProps) => {
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    flag: any;
    newValue: boolean;
  }>({ open: false, flag: null, newValue: false });

  const featureFlags = adminData?.feature_flags || [];

  const criticalFlags = ['trading_enabled_global', 'trading_enabled'];

  const toggleFlag = async (flagKey: string, currentValue: boolean) => {
    const newValue = !currentValue;
    const flag = featureFlags.find((f: any) => f.key === flagKey);

    if (criticalFlags.includes(flagKey) && newValue === false) {
      setConfirmDialog({ open: true, flag, newValue });
      return;
    }

    await updateFlag(flagKey, newValue);
  };

  const updateFlag = async (flagKey: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('feature_flags')
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq('key', flagKey);

      if (error) throw error;

      toast.success(`Feature flag "${flagKey}" ${enabled ? 'enabled' : 'disabled'}`);
      onUpdate();
    } catch (err: any) {
      console.error('Error updating feature flag:', err);
      toast.error('Failed to update feature flag');
    }
  };

  const handleConfirm = async () => {
    if (confirmDialog.flag) {
      await updateFlag(confirmDialog.flag.key, confirmDialog.newValue);
    }
    setConfirmDialog({ open: false, flag: null, newValue: false });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Feature Flag Management</h2>
        <p className="text-muted-foreground">Control system-wide feature toggles</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {featureFlags.map((flag: any) => {
          const isCritical = criticalFlags.includes(flag.key);
          
          return (
            <Card key={flag.id} className={isCritical ? 'border-orange-500' : ''}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Flag className={`h-4 w-4 ${isCritical ? 'text-orange-500' : ''}`} />
                  {flag.key}
                  {isCritical && (
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                  )}
                </CardTitle>
                <CardDescription>{flag.description || 'No description'}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    Status: <span className="font-medium">{flag.enabled ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <Switch
                    checked={flag.enabled}
                    onCheckedChange={() => toggleFlag(flag.key, flag.enabled)}
                  />
                </div>
                {isCritical && (
                  <div className="mt-2 text-xs text-orange-600 dark:text-orange-400">
                    ⚠️ Critical flag - affects system operation
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {featureFlags.length === 0 && (
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            <Flag className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No feature flags configured</p>
          </CardContent>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => 
        setConfirmDialog(prev => ({ ...prev, open }))
      }>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Confirm Critical Change
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to <strong>disable</strong> the feature flag <strong>{confirmDialog.flag?.key}</strong>.
              <br /><br />
              {confirmDialog.flag?.key === 'trading_enabled_global' && (
                <>This will <strong>stop all trading activity</strong> across the entire system. 
                All live trading will be paused immediately.</>
              )}
              {confirmDialog.flag?.key === 'trading_enabled' && (
                <>This will <strong>disable trading</strong> for this instance. 
                Active positions may remain open.</>
              )}
              <br /><br />
              Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} className="bg-destructive hover:bg-destructive/90">
              Confirm Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
