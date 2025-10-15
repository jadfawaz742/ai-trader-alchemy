import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Search, Download, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface AuditLog {
  id: string;
  function_name: string;
  action: string;
  user_id: string | null;
  metadata: any;
  created_at: string;
}

interface AuditLogViewerProps {
  logs: AuditLog[];
  loading: boolean;
  onRefresh: () => void;
  onExport: () => void;
}

export const AuditLogViewer = ({ logs, loading, onRefresh, onExport }: AuditLogViewerProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const filteredLogs = logs.filter(log => 
    log.function_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.user_id && log.user_id.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getStatusBadge = (metadata: any) => {
    if (!metadata) return null;
    
    if (metadata.error || metadata.status === 'error') {
      return <Badge variant="destructive">Error</Badge>;
    }
    if (metadata.status === 'success' || metadata.result === 'success') {
      return <Badge className="bg-green-600">Success</Badge>;
    }
    return <Badge variant="secondary">Info</Badge>;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <Card className="border-slate-700 bg-slate-800/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white">Audit Logs</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              className="border-slate-600 bg-slate-700 hover:bg-slate-600 text-white"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              className="border-slate-600 bg-slate-700 hover:bg-slate-600 text-white"
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <Search className="h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search logs by function, action, or user..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-slate-700">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700 hover:bg-slate-700/50">
                <TableHead className="text-slate-300">Timestamp</TableHead>
                <TableHead className="text-slate-300">Function</TableHead>
                <TableHead className="text-slate-300">Action</TableHead>
                <TableHead className="text-slate-300">User ID</TableHead>
                <TableHead className="text-slate-300">Status</TableHead>
                <TableHead className="text-slate-300 w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-400 py-8">
                    {loading ? 'Loading logs...' : 'No audit logs found'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <Collapsible key={log.id} asChild>
                    <>
                      <TableRow className="border-slate-700 hover:bg-slate-700/30">
                        <TableCell className="text-slate-300 font-mono text-sm">
                          {formatDate(log.created_at)}
                        </TableCell>
                        <TableCell className="text-slate-300">
                          <code className="text-sm bg-slate-700 px-2 py-1 rounded">
                            {log.function_name}
                          </code>
                        </TableCell>
                        <TableCell className="text-slate-300">{log.action}</TableCell>
                        <TableCell className="text-slate-400 font-mono text-xs">
                          {log.user_id ? log.user_id.slice(0, 8) + '...' : 'system'}
                        </TableCell>
                        <TableCell>{getStatusBadge(log.metadata)}</TableCell>
                        <TableCell>
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                              className="text-slate-400 hover:text-white"
                            >
                              {expandedRow === log.id ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                        </TableCell>
                      </TableRow>
                      <CollapsibleContent asChild>
                        <TableRow className="border-slate-700 bg-slate-900/50">
                          <TableCell colSpan={6} className="p-4">
                            <div className="text-slate-300">
                              <div className="font-semibold mb-2 text-white">Metadata:</div>
                              <pre className="bg-slate-800 p-3 rounded text-xs overflow-x-auto">
                                {JSON.stringify(log.metadata, null, 2)}
                              </pre>
                            </div>
                          </TableCell>
                        </TableRow>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
