import React from 'react';
import AdvancedTradingBot from "@/components/AdvancedTradingBot";
import { MarketActivityFeed } from "@/components/MarketActivityFeed";
import { PortfolioDashboard } from "@/components/PortfolioDashboard";
import { PortfolioProvider } from "@/components/PortfolioProvider";
import { TradingLearningLogs } from "@/components/TradingLearningLogs";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, LogOut, User, Settings, BarChart3, Brain } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StockAnalyzer from "@/components/StockAnalyzer";
import NewsWidget from "@/components/NewsWidget";

const AdvancedTrading = () => {
  const { user, loading, signOut, isAuthenticated } = useAuth();

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast({
        title: "Error",
        description: "Failed to sign out. Please try again.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Signed out",
        description: "You have been successfully signed out.",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 px-4">
            Advanced PPO Trading Bot
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-gray-300 max-w-2xl mx-auto mb-8 px-4">
            Advanced AI-powered trading with adaptive learning and backtesting
          </p>
          <Link to="/auth">
            <Button size="lg" className="text-base sm:text-lg px-6 sm:px-8 py-3 w-full sm:w-auto">
              Sign In to Get Started
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <PortfolioProvider>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="container mx-auto px-4 py-4 sm:py-8">
          <div className="flex flex-col lg:flex-row justify-between items-center mb-6 sm:mb-8 gap-4">
            <div className="text-center lg:flex-1">
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-white mb-2 sm:mb-4 flex items-center justify-center gap-2 sm:gap-4">
                <Brain className="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 text-purple-400" />
                <span className="break-words">Advanced PPO Trading Bot</span>
              </h1>
              <p className="text-sm sm:text-base md:text-lg lg:text-xl text-gray-300 max-w-2xl mx-auto px-2">
                Advanced AI-powered trading with adaptive learning, backtesting, and risk management
              </p>
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              <Button variant="outline" asChild className="text-xs sm:text-sm">
                <Link to="/stocks">
                  <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Browse Stocks</span>
                  <span className="sm:hidden">Stocks</span>
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="text-xs sm:text-sm">
                    <User className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Account
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 z-50 bg-background">
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="flex items-center">
                      <User className="h-4 w-4 mr-2" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/settings" className="flex items-center">
                      <Settings className="h-4 w-4 mr-2" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          
          <Tabs defaultValue="trading" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 bg-slate-800/50 border border-slate-700 p-2 h-auto">
              <TabsTrigger value="trading" className="text-white data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                Advanced Trading
              </TabsTrigger>
              <TabsTrigger value="portfolio" className="text-white data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                Portfolio
              </TabsTrigger>
              <TabsTrigger value="learning" className="text-white data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                AI Learning
              </TabsTrigger>
              <TabsTrigger value="market" className="text-white data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                Market Activity
              </TabsTrigger>
              <TabsTrigger value="analyzer" className="text-white data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                Stock Analyzer
              </TabsTrigger>
              <TabsTrigger value="news" className="text-white data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                Market News
              </TabsTrigger>
            </TabsList>

            <TabsContent value="trading" className="space-y-6">
              <div className="grid grid-cols-1 gap-6">
                <AdvancedTradingBot />
              </div>
            </TabsContent>

            <TabsContent value="portfolio" className="space-y-6">
              <PortfolioDashboard />
            </TabsContent>

            <TabsContent value="learning" className="space-y-6">
              <TradingLearningLogs />
            </TabsContent>

            <TabsContent value="market" className="space-y-6">
              <MarketActivityFeed isActive={true} />
            </TabsContent>

            <TabsContent value="analyzer" className="space-y-6">
              <StockAnalyzer />
            </TabsContent>

            <TabsContent value="news" className="space-y-6">
              <NewsWidget />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PortfolioProvider>
  );
};

export default AdvancedTrading;