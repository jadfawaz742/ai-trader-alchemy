import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { XCircle } from "lucide-react";
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

export const ClosePaperTradesButton = ({ onTradesClosed }: { onTradesClosed?: () => void }) => {
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = async () => {
    setIsClosing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Not authenticated");
        return;
      }

      const { data, error } = await supabase.functions.invoke('close-paper-trade', {
        body: { close_all: true },
      });

      if (error) throw error;

      toast.success(`Closed ${data.closedCount} paper trades at current market prices`);
      
      // Refresh the page to show updated data
      if (onTradesClosed) {
        onTradesClosed();
      } else {
        setTimeout(() => window.location.reload(), 1000);
      }
    } catch (error: any) {
      console.error('Error closing paper trades:', error);
      toast.error(error.message || 'Failed to close trades');
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={isClosing}>
          <XCircle className="h-4 w-4 mr-2" />
          Close All Trades
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close All Open Paper Trades?</AlertDialogTitle>
          <AlertDialogDescription>
            This will close all open paper trades at current market prices and calculate final P&L.
            Closed trades will appear in the Performance tab. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleClose} disabled={isClosing}>
            {isClosing ? 'Closing...' : 'Close All Trades'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
