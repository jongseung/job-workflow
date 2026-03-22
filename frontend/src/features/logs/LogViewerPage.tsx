import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { getRecentRuns, getWorkflowRunLogs, type RecentRun, type RunType } from "@/api/runs";
import { getRunLogs } from "@/api/logs";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { cn, formatDate } from "@/lib/utils";
import { Card, Input, Select } from "@/components/ui";
import { Search, Briefcase, GitMerge } from "lucide-react";

const RUN_TYPE_TABS: { key: RunType; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "job", label: "잡" },
  { key: "workflow", label: "워크플로우" },
];

export function LogViewerPage() {
  const [selectedRun, setSelectedRun] = useState<RecentRun | null>(null);
  const [streamFilter, setStreamFilter] = useState<string>("");
  const [searchText, setSearchText] = useState("");
  const [runTypeFilter, setRunTypeFilter] = useState<RunType>("all");

  const { data: runs } = useQuery({
    queryKey: ["recentRuns", 50, runTypeFilter],
    queryFn: () => getRecentRuns(50, runTypeFilter),
  });

  // Job logs
  const { data: jobLogData } = useQuery({
    queryKey: ["logs", selectedRun?.id, streamFilter, searchText],
    queryFn: () =>
      getRunLogs(selectedRun!.id, {
        page_size: 500,
        stream: streamFilter || undefined,
        search: searchText || undefined,
      }),
    enabled: !!selectedRun && selectedRun.run_type === "job",
  });

  // Workflow logs (synthetic from node runs)
  const { data: wfLogData } = useQuery({
    queryKey: ["workflowLogs", selectedRun?.id],
    queryFn: () => getWorkflowRunLogs(selectedRun!.id),
    enabled: !!selectedRun && selectedRun.run_type === "workflow",
  });

  // Use the right log data based on run type
  const logData = selectedRun?.run_type === "workflow" ? wfLogData : jobLogData;

  // Apply client-side filter for workflow logs (server doesn't filter)
  const filteredLogs = logData?.items?.filter((log) => {
    if (streamFilter && log.stream !== streamFilter) return false;
    if (searchText && !log.message.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <Header title="Logs" />
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 h-[calc(100vh-130px)]">
          {/* Run selector */}
          <Card padding="none" className="overflow-hidden flex flex-col">
            <div className="px-5 pt-5 pb-3 border-b border-border/40">
              <h3 className="text-[11px] font-bold text-text-muted uppercase tracking-[0.15em]">
                최근 실행
              </h3>
              <p className="text-xs text-text-muted mt-1 font-medium">{runs?.length ?? 0}개 항목</p>
            </div>

            {/* Run type tabs */}
            <div className="flex border-b border-border/40">
              {RUN_TYPE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setRunTypeFilter(tab.key)}
                  className={cn(
                    "flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors border-b-2",
                    runTypeFilter === tab.key
                      ? "text-primary border-primary"
                      : "text-text-muted border-transparent hover:text-text-secondary"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {runs?.map((run) => (
                <button
                  key={run.id}
                  onClick={() => setSelectedRun(run)}
                  className={cn(
                    "w-full text-left px-4 py-3.5 rounded-xl text-sm transition-all duration-150 relative",
                    selectedRun?.id === run.id
                      ? "bg-primary/10 text-primary"
                      : "text-text-secondary hover:bg-bg-hover/60",
                  )}
                >
                  {selectedRun?.id === run.id && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-primary rounded-r-full" />
                  )}
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {run.run_type === "workflow" ? (
                        <GitMerge className="w-3 h-3 text-purple-400 flex-shrink-0" />
                      ) : (
                        <Briefcase className="w-3 h-3 text-amber-400 flex-shrink-0" />
                      )}
                      <span className="truncate font-semibold text-xs">
                        {run.run_type === "workflow"
                          ? run.workflow_name || run.workflow_id?.slice(0, 8)
                          : run.job_name || run.job_id?.slice(0, 8)}
                      </span>
                    </div>
                    <StatusBadge status={run.status} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                        run.run_type === "workflow"
                          ? "bg-purple-500/10 text-purple-400"
                          : "bg-amber-500/10 text-amber-400"
                      )}
                    >
                      {run.run_type === "workflow" ? "WF" : "JOB"}
                    </span>
                    <span className="text-[11px] text-text-muted font-medium">
                      {run.created_at ? formatDate(run.created_at) : ""}
                    </span>
                  </div>
                </button>
              ))}
              {(!runs || runs.length === 0) && (
                <p className="text-center py-8 text-xs text-text-muted font-medium">실행 기록 없음</p>
              )}
            </div>
          </Card>

          {/* Log content */}
          <Card padding="none" className="lg:col-span-3 overflow-hidden flex flex-col">
            {/* Toolbar */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40 bg-bg-elevated/30 shrink-0">
              {selectedRun && (
                <div className="flex items-center gap-2 mr-2">
                  {selectedRun.run_type === "workflow" ? (
                    <GitMerge className="w-3.5 h-3.5 text-purple-400" />
                  ) : (
                    <Briefcase className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <span className="text-xs font-semibold text-text-primary truncate max-w-[180px]">
                    {selectedRun.run_type === "workflow"
                      ? selectedRun.workflow_name
                      : selectedRun.job_name}
                  </span>
                </div>
              )}
              <Select
                value={streamFilter}
                onChange={(e) => setStreamFilter(e.target.value)}
                className="w-32 text-xs py-2"
              >
                <option value="">모든 스트림</option>
                <option value="stdout">stdout</option>
                <option value="stderr">stderr</option>
                <option value="system">system</option>
              </Select>
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                <Input
                  type="text"
                  placeholder="로그 검색..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pl-9 py-2 text-xs"
                />
              </div>
              {selectedRun && (
                <span className="text-[11px] text-text-muted whitespace-nowrap font-bold tabular-nums">
                  {filteredLogs?.length ?? 0}줄
                </span>
              )}
            </div>

            {/* Log output */}
            <div
              className="flex-1 overflow-y-auto p-6 bg-[#0d0d0f]"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {selectedRun ? (
                filteredLogs?.length ? (
                  filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      className={cn(
                        "py-1.5 flex leading-6 text-xs group",
                        log.stream === "stderr"
                          ? "text-danger"
                          : log.stream === "system"
                            ? "text-info"
                            : "text-[#c9d1d9]",
                      )}
                    >
                      <span className="text-[#3d3d4a] w-10 shrink-0 text-right mr-5 select-none tabular-nums group-hover:text-text-muted transition-colors">
                        {log.line_number}
                      </span>
                      <span className="text-[#3d3d4a] w-20 shrink-0 mr-4 select-none group-hover:text-text-muted transition-colors">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span className={cn(
                        "w-16 shrink-0 mr-4 select-none font-semibold",
                        log.stream === "stderr" ? "text-danger/50" : log.stream === "system" ? "text-info/50" : "text-[#3d3d4a]"
                      )}>
                        [{log.stream}]
                      </span>
                      <span className="break-all leading-relaxed">
                        {log.message}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-text-muted text-center py-16 text-sm font-sans font-medium">
                    로그를 찾을 수 없습니다
                  </p>
                )
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-bg-tertiary/50 flex items-center justify-center">
                    <Search className="w-5 h-5 text-text-muted" />
                  </div>
                  <p className="text-text-muted text-sm font-sans font-medium">
                    로그를 보려면 실행을 선택하세요
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
