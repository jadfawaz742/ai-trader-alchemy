import React from 'react';
import { PortfolioContext, usePortfolioProvider } from '@/hooks/usePortfolio';

interface PortfolioProviderProps {
  children: React.ReactNode;
}

export const PortfolioProvider: React.FC<PortfolioProviderProps> = ({ children }) => {
  const portfolioValue = usePortfolioProvider();

  return (
    <PortfolioContext.Provider value={portfolioValue}>
      {children}
    </PortfolioContext.Provider>
  );
};