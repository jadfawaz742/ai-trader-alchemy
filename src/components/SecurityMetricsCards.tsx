import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Users, AlertTriangle, TrendingUp } from "lucide-react";

interface SecurityMetricsProps {
  totalCalls: number;
  uniqueUsers: number;
  failedOps: number;
  mostActiveFunction: string;
}

export const SecurityMetricsCards = ({ 
  totalCalls, 
  uniqueUsers, 
  failedOps, 
  mostActiveFunction 
}: SecurityMetricsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="border-slate-700 bg-slate-800/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-slate-200">
            Total Service Calls
          </CardTitle>
          <Activity className="h-4 w-4 text-blue-400" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white">{totalCalls}</div>
          <p className="text-xs text-slate-400 mt-1">Last 24 hours</p>
        </CardContent>
      </Card>

      <Card className="border-slate-700 bg-slate-800/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-slate-200">
            Unique Users
          </CardTitle>
          <Users className="h-4 w-4 text-green-400" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white">{uniqueUsers}</div>
          <p className="text-xs text-slate-400 mt-1">With service access</p>
        </CardContent>
      </Card>

      <Card className="border-slate-700 bg-slate-800/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-slate-200">
            Failed Operations
          </CardTitle>
          <AlertTriangle className="h-4 w-4 text-red-400" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white">{failedOps}</div>
          <p className="text-xs text-slate-400 mt-1">Errors detected</p>
        </CardContent>
      </Card>

      <Card className="border-slate-700 bg-slate-800/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-slate-200">
            Most Active Function
          </CardTitle>
          <TrendingUp className="h-4 w-4 text-purple-400" />
        </CardHeader>
        <CardContent>
          <div className="text-lg font-bold text-white truncate">
            {mostActiveFunction || 'N/A'}
          </div>
          <p className="text-xs text-slate-400 mt-1">Top function</p>
        </CardContent>
      </Card>
    </div>
  );
};
