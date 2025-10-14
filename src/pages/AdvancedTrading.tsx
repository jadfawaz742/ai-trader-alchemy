import React from 'react';
import { PortfolioProvider } from "@/components/PortfolioProvider";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, LogOut, User, Settings, BarChart3, Brain } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TradingSetupDashboard } from "@/components/dashboards/TradingSetupDashboard";
import { BacktestingDashboard } from "@/components/dashboards/BacktestingDashboard";
import { MarketResearchDashboard } from "@/components/dashboards/MarketResearchDashboard";
import { LiveTradingMasterControl } from "@/components/LiveTradingMasterControl";

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

  // Skip loading state and go straight to content if authenticated
  if (loading && !user) {
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
          
          <Tabs defaultValue="setup" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 gap-2 bg-slate-800/50 border border-slate-700 p-2 h-auto">
              <TabsTrigger value="setup" className="text-white data-[state=active]:bg-purple-600 data-[state=active]:text-white text-sm sm:text-base py-3">
                🚀 Trading Setup
              </TabsTrigger>
              <TabsTrigger value="backtest" className="text-white data-[state=active]:bg-purple-600 data-[state=active]:text-white text-sm sm:text-base py-3">
                📊 Backtesting & Training
              </TabsTrigger>
              <TabsTrigger value="research" className="text-white data-[state=active]:bg-purple-600 data-[state=active]:text-white text-sm sm:text-base py-3">
                📰 Market Research
              </TabsTrigger>
            </TabsList>

            <TabsContent value="setup" className="space-y-6">
              <LiveTradingMasterControl />
              <TradingSetupDashboard />
            </TabsContent>

            <TabsContent value="backtest" className="space-y-6">
              <BacktestingDashboard />
            </TabsContent>

            <TabsContent value="research" className="space-y-6">
              <MarketResearchDashboard />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PortfolioProvider>
  );
};

export default AdvancedTrading;