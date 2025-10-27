import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { Trash2, ChevronDown } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const ClearPaperTradingButton = () => {
  const [isClearing, setIsClearing] = useState(false);
  const [clearType, setClearType] = useState<'queued_only' | 'complete'>('queued_only');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleClear = async () => {
    setIsClearing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Not authenticated");
        return;
      }

      const { data, error } = await supabase.functions.invoke('clear-paper-trading', {
        body: { clearType },
      });

      if (error) throw error;

      const message = clearType === 'complete'
        ? `Complete reset: Cleared ${data.signalsDeleted} signals and ${data.tradesDeleted} trades (all statuses)`
        : `Cleared ${data.signalsDeleted} queued signals and ${data.tradesDeleted} open trades`;
      
      toast.success(message);
      setIsDialogOpen(false);
      
      // Refresh the page to show updated data
      setTimeout(() => window.location.reload(), 1000);
    } catch (error: any) {
      console.error('Error clearing paper trading:', error);
      toast.error(error.message || 'Failed to clear data');
    } finally {
      setIsClearing(false);
    }
  };

  const openDialog = (type: 'queued_only' | 'complete') => {
    setClearType(type);
    setIsDialogOpen(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="destructive" size="sm" disabled={isClearing}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear Paper Trading
            <ChevronDown className="h-4 w-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => openDialog('queued_only')}>
            Clear Queued Only
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openDialog('complete')}>
            Complete Reset (All Data)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {clearType === 'complete' ? 'Complete Reset?' : 'Clear Queued Data?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {clearType === 'complete' 
                ? 'This will delete ALL signals and ALL paper trades (including closed trades and performance history). This action cannot be undone.'
                : 'This will delete all queued signals and open paper trades only. Closed trades and performance history will be preserved. This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClear} disabled={isClearing}>
              {isClearing ? 'Clearing...' : clearType === 'complete' ? 'Reset Everything' : 'Clear Queued'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
