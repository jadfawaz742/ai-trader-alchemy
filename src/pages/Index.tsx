import StockAnalyzer from "@/components/StockAnalyzer";
import TradingDashboard from "@/components/TradingDashboard";
import NewsWidget from "@/components/NewsWidget";
import { MarketActivityFeed } from "@/components/MarketActivityFeed";
import { PortfolioProvider } from "@/components/PortfolioProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, LogOut, User, Settings } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

const Index = () => {
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
            AI Trading Bot
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-8">
            AI-powered stock analysis with PPO risk management and automated trading simulation
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
                AI Trading Bot
              </h1>
              <p className="text-xl text-gray-300 max-w-2xl mx-auto">
                AI-powered stock analysis with PPO risk management and automated trading simulation
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="ml-4">
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
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <StockAnalyzer />
            </div>
            <div className="space-y-6">
              <Tabs defaultValue="analysis" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="analysis" className="text-sm">
                    AI Analysis
                  </TabsTrigger>
                  <TabsTrigger value="trading" className="text-sm">
                    PPO Trading
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="analysis" className="space-y-6">
                  <NewsWidget />
                </TabsContent>
                
                <TabsContent value="trading" className="space-y-6">
                  <TradingDashboard />
                  <MarketActivityFeed isActive={true} />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </div>
    </PortfolioProvider>
  );
};

export default Index;
