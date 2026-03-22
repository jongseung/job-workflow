import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, Plus, Trash2, Edit2, Wifi, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button, Card, CardHeader } from '@/components/ui';
import { getDataSources, deleteDataSource, testSavedConnection } from '@/api/datasources';
import type { DataSource, ConnectionTestResult } from '@/types/api';
import { cn } from '@/lib/utils';

const DB_TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  postgresql: { label: 'PostgreSQL', cls: 'bg-info/10 text-info' },
  mysql: { label: 'MySQL', cls: 'bg-warning/10 text-warning' },
  mssql: { label: 'MSSQL', cls: 'bg-purple-500/10 text-purple-400' },
  sqlite: { label: 'SQLite', cls: 'bg-success/10 text-success' },
};

function TestBadge({ result }: { result: ConnectionTestResult | null }) {
  if (!result) return null;
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold',
      result.success ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
    )}>
      {result.success ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {result.success ? `OK ${result.latency_ms}ms` : '실패'}
    </span>
  );
}

export function DataSourceListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [testResults, setTestResults] = useState<Record<string, ConnectionTestResult | null>>({});
  const [testingId, setTestingId] = useState<string | null>(null);

  const { data: datasources = [], isLoading } = useQuery({
    queryKey: ['datasources'],
    queryFn: getDataSources,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDataSource,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['datasources'] }),
  });

  const handleTest = async (ds: DataSource) => {
    setTestingId(ds.id);
    try {
      const result = await testSavedConnection(ds.id);
      setTestResults((prev) => ({ ...prev, [ds.id]: result }));
    } catch (e: any) {
      setTestResults((prev) => ({ ...prev, [ds.id]: { success: false, message: String(e), latency_ms: null } }));
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = (ds: DataSource) => {
    if (confirm(`데이터소스 "${ds.name}"을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
      deleteMutation.mutate(ds.id);
    }
  };

  return (
    <div>
      <Header title="Datasources" />
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-sm text-text-muted">
              총 {datasources.length}개의 데이터소스가 등록되어 있습니다
            </p>
          </div>
          <Button onClick={() => navigate('/datasources/new')} icon={Plus}>새 데이터소스</Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-2xl bg-bg-card/50 animate-pulse" />
            ))}
          </div>
        ) : datasources.length === 0 ? (
          <Card>
            <div className="text-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-bg-elevated/50 flex items-center justify-center mx-auto mb-5">
                <Database className="w-7 h-7 text-text-muted" />
              </div>
              <p className="text-base font-bold text-text-primary mb-2">등록된 데이터소스가 없습니다</p>
              <p className="text-sm text-text-muted mb-6">데이터베이스를 연결하여 작업 결과를 저장하고 조회하세요</p>
              <Button onClick={() => navigate('/datasources/new')} icon={Plus}>새 데이터소스</Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {datasources.map((ds) => {
              const badge = DB_TYPE_BADGE[ds.db_type] || { label: ds.db_type, cls: 'bg-bg-elevated text-text-muted' };
              return (
                <Card
                  key={ds.id}
                  className="cursor-pointer hover:border-border/60 transition-all"
                  onClick={() => navigate(`/datasources/${ds.id}`)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-primary/8 flex items-center justify-center shrink-0">
                      <Database className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-bold text-text-primary">{ds.name}</span>
                        <span className={cn('px-2.5 py-0.5 rounded-lg text-[11px] font-bold uppercase tracking-wider', badge.cls)}>
                          {badge.label}
                        </span>
                        {!ds.is_active && (
                          <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-text-muted/10 text-text-muted">
                            비활성
                          </span>
                        )}
                        <TestBadge result={testResults[ds.id] ?? null} />
                      </div>
                      <p className="text-sm text-text-muted mt-0.5 truncate">
                        {ds.db_type === 'sqlite' ? ds.database : `${ds.host}:${ds.port}/${ds.database}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={testingId === ds.id ? undefined : Wifi}
                        onClick={() => handleTest(ds)}
                        disabled={testingId === ds.id}
                      >
                        {testingId === ds.id
                          ? <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />테스트 중</span>
                          : '테스트'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Edit2}
                        onClick={() => navigate(`/datasources/${ds.id}/edit`)}
                      >
                        수정
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        icon={Trash2}
                        onClick={() => handleDelete(ds)}
                        disabled={deleteMutation.isPending}
                      />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
