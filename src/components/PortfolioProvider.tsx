import React, { createContext, useContext } from 'react';
import { usePortfolio, type PortfolioData } from '@/hooks/usePortfolio';

const PortfolioContext = createContext<PortfolioData | null>(null);

export const usePortfolioContext = () => {
  const context = useContext(PortfolioContext);
  if (!context) {
    throw new Error('usePortfolioContext must be used within a PortfolioProvider');
  }
  return context;
};

interface PortfolioProviderProps {
  children: React.ReactNode;
}

export const PortfolioProvider: React.FC<PortfolioProviderProps> = ({ children }) => {
  const portfolioValue = usePortfolio();

  return (
    <PortfolioContext.Provider value={portfolioValue}>
      {children}
    </PortfolioContext.Provider>
  );
};