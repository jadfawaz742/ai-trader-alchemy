import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import NewsWidget from '@/components/NewsWidget';
import StockAnalyzer from '@/components/StockAnalyzer';
import { MarketActivityFeed } from '@/components/MarketActivityFeed';
import { Newspaper, TrendingUp, ArrowRight } from 'lucide-react';

export function MarketResearchDashboard() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-r from-green-900/20 to-blue-900/20 border-green-500/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Newspaper className="h-8 w-8 text-green-400" />
              <div>
                <CardTitle className="text-2xl text-white">Market Research & Analysis</CardTitle>
                <CardDescription className="text-gray-300">
                  Stay informed with news, analysis, and real-time market data
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" asChild>
              <Link to="/stocks">
                <TrendingUp className="h-4 w-4 mr-2" />
                Browse All Stocks
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* News and Analysis Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Market News */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Latest Market News</h3>
          <NewsWidget />
        </div>

        {/* Stock Analyzer */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Quick Stock Analysis</h3>
          <StockAnalyzer />
        </div>
      </div>

      {/* Market Activity Feed */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Live Market Activity</h3>
        <MarketActivityFeed isActive={true} />
      </div>
    </div>
  );
}
