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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
            Advanced PPO Trading Bot
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-8">
            Advanced AI-powered trading with adaptive learning and backtesting
          </p>
          <Link to="/auth">
            <Button size="lg" className="text-lg px-8 py-3">
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
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-8">
            <div className="text-center flex-1">
              <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
                <Brain className="inline-block h-12 w-12 mr-4 text-purple-400" />
                Advanced PPO Trading Bot
              </h1>
              <p className="text-xl text-gray-300 max-w-2xl mx-auto">
                Advanced AI-powered trading with adaptive learning, backtesting, and risk management
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link to="/stocks">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Browse Stocks
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <User className="h-4 w-4 mr-2" />
                    Account
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
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
            <TabsList className="grid w-full grid-cols-6 bg-slate-800/50 border border-slate-700">
              <TabsTrigger value="trading" className="text-white data-[state=active]:bg-purple-600">
                Advanced Trading
              </TabsTrigger>
              <TabsTrigger value="portfolio" className="text-white data-[state=active]:bg-purple-600">
                Portfolio
              </TabsTrigger>
              <TabsTrigger value="learning" className="text-white data-[state=active]:bg-purple-600">
                AI Learning
              </TabsTrigger>
              <TabsTrigger value="market" className="text-white data-[state=active]:bg-purple-600">
                Market Activity
              </TabsTrigger>
              <TabsTrigger value="analyzer" className="text-white data-[state=active]:bg-purple-600">
                Stock Analyzer
              </TabsTrigger>
              <TabsTrigger value="news" className="text-white data-[state=active]:bg-purple-600">
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