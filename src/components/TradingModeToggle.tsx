import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';

interface TradingModeToggleProps {
  asset: string;
  paperTradingEnabled: boolean;
  onToggle: (asset: string, enabled: boolean) => Promise<void>;
}

export function TradingModeToggle({ asset, paperTradingEnabled, onToggle }: TradingModeToggleProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingValue, setPendingValue] = useState(false);

  const handleToggle = (checked: boolean) => {
    if (!checked) {
      // Switching to live trading - show warning
      setPendingValue(checked);
      setShowConfirm(true);
    } else {
      // Switching to paper trading - no warning needed
      onToggle(asset, checked);
    }
  };

  const confirmToggle = async () => {
    await onToggle(asset, pendingValue);
    setShowConfirm(false);
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="flex items-center space-x-2">
          <Switch
            id={`paper-${asset}`}
            checked={paperTradingEnabled}
            onCheckedChange={handleToggle}
          />
          <Label htmlFor={`paper-${asset}`} className="cursor-pointer">
            Paper Trading
          </Label>
        </div>
        <Badge variant={paperTradingEnabled ? 'secondary' : 'destructive'}>
          {paperTradingEnabled ? '📄 Paper Mode' : '⚠️ Live Mode'}
        </Badge>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Enable Live Trading?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p className="font-semibold text-foreground">
                You are about to enable LIVE TRADING for {asset}
              </p>
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 space-y-2">
                <p className="text-sm text-foreground">⚠️ <strong>This will execute REAL trades with REAL money</strong></p>
                <p className="text-sm text-foreground">⚠️ Requires proper broker connection and HMAC_SECRET configuration</p>
                <p className="text-sm text-foreground">⚠️ You are responsible for all losses</p>
              </div>
              <p className="text-sm">
                Make sure your broker connection is properly configured and tested before enabling live trading.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmToggle}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, Enable Live Trading
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
