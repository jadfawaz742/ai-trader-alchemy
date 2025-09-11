import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Portfolio {
  id: string;
  name: string;
  initial_balance: number;
  current_balance: number;
  total_pnl: number;
  created_at: string;
  user_id: string;
}

interface Position {
  id: string;
  symbol: string;
  quantity: number;
  average_price: number;
  current_price: number;
  current_value: number;
  unrealized_pnl: number;
  total_cost: number;
}

interface Trade {
  id: string;
  symbol: string;
  trade_type: string;
  quantity: number;
  price: number;
  total_amount: number;
  ppo_signal: any;
  risk_score: number;
  executed_at: string;
}

export interface PortfolioData {
  portfolio: Portfolio | null;
  positions: Position[];
  recentTrades: Trade[];
  loading: boolean;
  loadPortfolio: () => Promise<void>;
  updateBalance: (newBalance: number) => Promise<void>;
  updateInitialBalance: (amount: number) => Promise<void>;
  addTrade: (trade: Partial<Trade>) => Promise<void>;
  resetPortfolio: () => Promise<void>;
}

export const usePortfolio = () => {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadPortfolio = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Load portfolio
      const { data: portfolioData } = await supabase
        .from('portfolios')
        .select('*')
        .limit(1)
        .single();

      if (portfolioData) {
        setPortfolio(portfolioData);

        // Load positions
        const { data: positionsData } = await supabase
          .from('positions')
          .select('*')
          .eq('portfolio_id', portfolioData.id)
          .gt('quantity', 0);

        setPositions(positionsData || []);

        // Load recent trades
        const { data: tradesData } = await supabase
          .from('trades')
          .select('*')
          .eq('portfolio_id', portfolioData.id)
          .order('executed_at', { ascending: false })
          .limit(20);

        setRecentTrades(tradesData || []);
      } else {
        // Create default portfolio
        const { data: newPortfolio } = await supabase
          .from('portfolios')
          .insert({
            name: 'My Portfolio',
            user_id: user.id,
            current_balance: 100000,
            initial_balance: 100000
          })
          .select()
          .single();

        if (newPortfolio) {
          setPortfolio(newPortfolio);
          
          // Create default risk parameters
          await supabase
            .from('risk_parameters')
            .insert({
              portfolio_id: newPortfolio.id,
              user_id: user.id,
              max_position_size: 10.0,
              stop_loss_percent: 5.0,
              take_profit_percent: 15.0,
              min_confidence_score: 75.0,
              max_daily_trades: 10
            });

          toast({
            title: "Portfolio Created",
            description: "A new portfolio has been created with $100,000 starting balance",
          });
        }
      }
    } catch (error) {
      console.error('Error loading portfolio:', error);
      toast({
        title: "Error Loading Portfolio",
        description: "Failed to load portfolio data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const updateBalance = useCallback(async (newBalance: number) => {
    if (!portfolio) return;

    try {
      const { error } = await supabase
        .from('portfolios')
        .update({ 
          current_balance: newBalance,
          total_pnl: newBalance - portfolio.initial_balance
        })
        .eq('id', portfolio.id);

      if (error) throw error;

      setPortfolio(prev => prev ? {
        ...prev,
        current_balance: newBalance,
        total_pnl: newBalance - prev.initial_balance
      } : null);
    } catch (error) {
      console.error('Error updating balance:', error);
    }
  }, [portfolio]);
const updateInitialBalance = useCallback(async (amount: number) => {
  if (!portfolio) return;

  try {
    await supabase
      .from('portfolios')
      .update({ 
        initial_balance: amount,
        current_balance: amount,
        total_pnl: 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', portfolio.id);

    setPortfolio(prev => prev ? {
      ...prev,
      initial_balance: amount,
      current_balance: amount,
      total_pnl: 0
    } : null);

    toast({
      title: "Investment Amount Set",
      description: `Portfolio funded with $${amount.toLocaleString()}`,
    });

    await loadPortfolio();
  } catch (error) {
    console.error('Error setting investment amount:', error);
  }
}, [portfolio, loadPortfolio, toast]);

  const addTrade = useCallback(async (trade: Partial<Trade>) => {
    if (!portfolio) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Insert trade record
      const { error: tradeError } = await supabase
        .from('trades')
        .insert({
          user_id: user.id,
          portfolio_id: portfolio.id,
          symbol: trade.symbol,
          trade_type: trade.trade_type,
          quantity: trade.quantity,
          price: trade.price,
          total_amount: trade.total_amount,
          risk_score: trade.risk_score || 50,
          ppo_signal: trade.ppo_signal || {}
        });

      if (tradeError) throw tradeError;

      // Update or create position
      const { data: existingPosition } = await supabase
        .from('positions')
        .select('*')
        .eq('portfolio_id', portfolio.id)
        .eq('symbol', trade.symbol)
        .single();

      if (existingPosition) {
        // Update existing position
        let newQuantity = trade.trade_type === 'BUY' 
          ? existingPosition.quantity + (trade.quantity || 0)
          : existingPosition.quantity - (trade.quantity || 0);

        if (newQuantity <= 0) {
          // Close position if quantity reaches zero or below
          await supabase
            .from('positions')
            .delete()
            .eq('id', existingPosition.id);
        } else {
          // Update position with new average price
          const tradeAmount = (trade.price || 0) * (trade.quantity || 0);
          const totalCost = trade.trade_type === 'BUY' 
            ? existingPosition.total_cost + tradeAmount
            : existingPosition.total_cost - (existingPosition.average_price * (trade.quantity || 0));
          const avgPrice = totalCost / newQuantity;
          const currentValue = newQuantity * (trade.price || 0);
          const unrealizedPnL = currentValue - totalCost;

          await supabase
            .from('positions')
            .update({
              quantity: newQuantity,
              average_price: avgPrice,
              current_price: trade.price,
              total_cost: totalCost,
              current_value: currentValue,
              unrealized_pnl: unrealizedPnL,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingPosition.id);
        }
      } else if (trade.trade_type === 'BUY') {
        // Create new position for BUY orders only
        const totalCost = (trade.price || 0) * (trade.quantity || 0);
        await supabase
          .from('positions')
          .insert({
            user_id: user.id,
            portfolio_id: portfolio.id,
            symbol: trade.symbol,
            quantity: trade.quantity,
            average_price: trade.price,
            current_price: trade.price,
            total_cost: totalCost,
            current_value: totalCost,
            unrealized_pnl: 0
          });
      }

      // Update portfolio balance - For BUY, subtract cash; for SELL, add cash
      const balanceChange = trade.trade_type === 'BUY' 
        ? -(trade.total_amount || 0)
        : (trade.total_amount || 0);

      const newBalance = portfolio.current_balance + balanceChange;
      
      // Calculate total P&L including both unrealized (from positions) and realized (from balance change)
      const totalUnrealizedPnL = positions.reduce((sum, pos) => sum + (pos.unrealized_pnl || 0), 0);
      const realizedPnL = newBalance - portfolio.initial_balance;
      const totalPnL = realizedPnL + totalUnrealizedPnL;

      await supabase
        .from('portfolios')
        .update({ 
          current_balance: newBalance,
          total_pnl: totalPnL,
          updated_at: new Date().toISOString()
        })
        .eq('id', portfolio.id);

      // Reload portfolio data to get updated positions before calculating total P&L
      await loadPortfolio();
      
      // After reload, get the updated positions and calculate total P&L including unrealized gains
      const { data: updatedPositions } = await supabase
        .from('positions')
        .select('*')
        .eq('portfolio_id', portfolio.id)
        .gt('quantity', 0);
      
      const updatedTotalUnrealizedPnL = (updatedPositions || []).reduce((sum, pos) => sum + (pos.unrealized_pnl || 0), 0);
      const updatedTotalPnL = (newBalance - portfolio.initial_balance) + updatedTotalUnrealizedPnL;
      
      // Final update with complete P&L calculation
      await supabase
        .from('portfolios')
        .update({ 
          total_pnl: updatedTotalPnL,
          updated_at: new Date().toISOString()
        })
        .eq('id', portfolio.id);

      setPortfolio(prev => prev ? {
        ...prev,
        current_balance: newBalance,
        total_pnl: updatedTotalPnL
      } : null);
    } catch (error) {
      console.error('Error adding trade:', error);
    }
  }, [portfolio, loadPortfolio]);

  const resetPortfolio = useCallback(async () => {
    if (!portfolio) return;

    try {
      // Reset portfolio balance
      await supabase
        .from('portfolios')
        .update({ 
          current_balance: portfolio.initial_balance,
          total_pnl: 0
        })
        .eq('id', portfolio.id);

      // Clear positions and trades
      await Promise.all([
        supabase.from('positions').delete().eq('portfolio_id', portfolio.id),
        supabase.from('trades').delete().eq('portfolio_id', portfolio.id)
      ]);

      toast({
        title: "Portfolio Reset",
        description: "Portfolio has been reset to initial state",
      });

      // Reload data
      await loadPortfolio();
    } catch (error) {
      console.error('Error resetting portfolio:', error);
      toast({
        title: "Error",
        description: "Failed to reset portfolio",
        variant: "destructive"
      });
    }
  }, [portfolio, loadPortfolio, toast]);

  useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

return {
  portfolio,
  positions,
  recentTrades,
  loading,
  loadPortfolio,
  updateBalance,
  updateInitialBalance,
  addTrade,
  resetPortfolio,
};
};