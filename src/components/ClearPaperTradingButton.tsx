import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const ClearPaperTradingButton = () => {
  const [isClearing, setIsClearing] = useState(false);

  const handleClear = async () => {
    setIsClearing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Not authenticated");
        return;
      }

      const { data, error } = await supabase.functions.invoke('clear-paper-trading', {
        body: {},
      });

      if (error) throw error;

      toast.success(`Cleared ${data.signalsDeleted} signals and ${data.tradesDeleted} paper trades`);
      
      // Refresh the page to show updated data
      setTimeout(() => window.location.reload(), 1000);
    } catch (error: any) {
      console.error('Error clearing paper trading:', error);
      toast.error(error.message || 'Failed to clear data');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" disabled={isClearing}>
          <Trash2 className="h-4 w-4 mr-2" />
          Clear Paper Trading
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear All Paper Trading Data?</AlertDialogTitle>
          <AlertDialogDescription>
            This will delete all queued signals and open paper trades. This action cannot be undone.
            New signals will be generated on the next cycle with the corrected position sizing.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleClear} disabled={isClearing}>
            {isClearing ? 'Clearing...' : 'Clear All Data'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
