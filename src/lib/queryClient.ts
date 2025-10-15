import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
      refetchOnWindowFocus: false,
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
    }
  }
});

// Prefetch key queries for dashboard
export const prefetchDashboardData = async (userId: string) => {
  const { supabase } = await import('@/integrations/supabase/client');
  
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: ['signals', userId],
      queryFn: async () => {
        const { data } = await supabase
          .from('signals')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50);
        return data;
      }
    }),
    queryClient.prefetchQuery({
      queryKey: ['alerts', userId],
      queryFn: async () => {
        const { data } = await supabase
          .from('trading_alerts')
          .select('*')
          .eq('user_id', userId)
          .eq('acknowledged', false)
          .order('created_at', { ascending: false });
        return data;
      }
    })
  ]);
};
