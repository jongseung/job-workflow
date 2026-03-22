import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Database, Edit2, Trash2, Wifi, CheckCircle2, XCircle,
  ChevronRight, Table2, Code2, Eye, Loader2, RefreshCw
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button, Card, CardHeader, TabList, TabTrigger, TabContent } from '@/components/ui';
import {
  getDataSource, deleteDataSource, testSavedConnection,
  getDataSourceTables, getTableSchema, getTablePreview
} from '@/api/datasources';
import type { ConnectionTestResult, TableSchema, TablePreview } from '@/types/api';
import { cn } from '@/lib/utils';

const DB_TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  postgresql: { label: 'PostgreSQL', cls: 'bg-info/10 text-info' },
  mysql: { label: 'MySQL', cls: 'bg-warning/10 text-warning' },
  mssql: { label: 'MSSQL', cls: 'bg-purple-500/10 text-purple-400' },
  sqlite: { label: 'SQLite', cls: 'bg-success/10 text-success' },
};

export function DataSourceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'info' | 'browse'>('info');
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableSubTab, setTableSubTab] = useState<'schema' | 'preview'>('schema');

  const { data: ds, isLoading } = useQuery({
    queryKey: ['datasource', id],
    queryFn: () => getDataSource(id!),
    enabled: !!id,
  });

  const { data: tablesData, isLoading: tablesLoading, refetch: refetchTables } = useQuery({
    queryKey: ['datasource-tables', id],
    queryFn: () => getDataSourceTables(id!),
    enabled: activeTab === 'browse' && !!id,
  });

  const { data: schema, isLoading: schemaLoading } = useQuery({
    queryKey: ['table-schema', id, selectedTable],
    queryFn: () => getTableSchema(id!, selectedTable!),
    enabled: !!selectedTable && tableSubTab === 'schema',
  });

  const { data: preview, isLoading: previewLoading } = useQuery({
    queryKey: ['table-preview', id, selectedTable],
    queryFn: () => getTablePreview(id!, selectedTable!),
    enabled: !!selectedTable && tableSubTab === 'preview',
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteDataSource(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasources'] });
      navigate('/datasources');
    },
  });

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testSavedConnection(id!);
      setTestResult(result);
    } catch (e: any) {
      setTestResult({ success: false, message: String(e), latency_ms: null });
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = () => {
    if (confirm(`데이터소스 "${ds?.name}"을(를) 삭제하시겠습니까?`)) {
      deleteMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <div>
        <Header title="데이터소스" />
        <div className="p-8 space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-bg-card/50 animate-pulse" />)}
        </div>
      </div>
    );
  }
  if (!ds) return null;

  const badge = DB_TYPE_BADGE[ds.db_type] || { label: ds.db_type, cls: 'bg-bg-elevated text-text-muted' };

  return (
    <div>
      <Header title={ds.name} />
      <div className="p-8">
        {/* Breadcrumb + Actions */}
        <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => navigate('/datasources')} icon={ArrowLeft}>
            데이터소스 목록으로
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" icon={testing ? undefined : Wifi} onClick={handleTest} disabled={testing}>
              {testing ? <span className="flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" />테스트 중...</span> : '연결 테스트'}
            </Button>
            <Button variant="secondary" size="sm" icon={Edit2} onClick={() => navigate(`/datasources/${id}/edit`)}>수정</Button>
            <Button variant="danger" size="sm" icon={Trash2} onClick={handleDelete} disabled={deleteMutation.isPending}>삭제</Button>
          </div>
        </div>

        {/* Connection test result */}
        {testResult && (
          <div className={cn(
            'flex items-center gap-3 p-4 rounded-xl border mb-6 text-sm font-medium',
            testResult.success ? 'bg-success/8 border-success/20 text-success' : 'bg-danger/8 border-danger/20 text-danger'
          )}>
            {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {testResult.message}
            {testResult.latency_ms !== null && <span className="opacity-70 text-xs ml-auto">{testResult.latency_ms}ms</span>}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6">
          <TabList>
            <TabTrigger active={activeTab === 'info'} onClick={() => setActiveTab('info')}>정보</TabTrigger>
            <TabTrigger active={activeTab === 'browse'} onClick={() => setActiveTab('browse')}>테이블 탐색</TabTrigger>
          </TabList>
        </div>

        {/* Info Tab */}
        <TabContent active={activeTab === 'info'}>
          <Card>
            <CardHeader title="연결 정보" action={<Database className="w-4 h-4 text-text-muted" />} />
            <div className="divide-y divide-border/20">
              {[
                { label: '이름', value: ds.name },
                { label: 'DB 종류', value: <span className={cn('px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider', badge.cls)}>{badge.label}</span> },
                { label: '상태', value: ds.is_active ? <span className="text-success font-bold">활성</span> : <span className="text-text-muted font-bold">비활성</span> },
                { label: '호스트', value: ds.db_type === 'sqlite' ? '—' : (ds.host || '—') },
                { label: '포트', value: ds.port?.toString() || '—' },
                { label: '데이터베이스', value: <span className="font-mono text-text-primary">{ds.database}</span> },
                { label: '사용자명', value: ds.username || '—' },
                { label: 'SSL 모드', value: ds.ssl_mode || '기본값' },
                { label: '설명', value: ds.description || '—' },
                { label: '생성일', value: new Date(ds.created_at).toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center py-4 first:pt-0 last:pb-0">
                  <span className="text-sm text-text-muted font-medium">{label}</span>
                  <span className="text-sm text-text-primary">{value}</span>
                </div>
              ))}
            </div>
          </Card>
        </TabContent>

        {/* Browse Tab */}
        <TabContent active={activeTab === 'browse'}>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Table List */}
            <Card className="lg:col-span-1" padding="none">
              <div className="p-5 border-b border-border/30 flex items-center justify-between">
                <span className="text-[11px] font-bold text-text-muted uppercase tracking-[0.15em]">테이블</span>
                <button onClick={() => refetchTables()} className="p-1 rounded-lg hover:bg-bg-hover transition-colors">
                  <RefreshCw className="w-3.5 h-3.5 text-text-muted" />
                </button>
              </div>
              <div className="overflow-y-auto max-h-[60vh]">
                {tablesLoading ? (
                  <div className="p-4 space-y-2">
                    {[1, 2, 3, 4].map((i) => <div key={i} className="h-9 rounded-lg bg-bg-elevated/40 animate-pulse" />)}
                  </div>
                ) : !tablesData?.tables?.length ? (
                  <div className="p-6 text-center">
                    <Table2 className="w-7 h-7 text-text-muted mx-auto mb-2" />
                    <p className="text-xs text-text-muted">테이블이 없습니다</p>
                  </div>
                ) : (
                  <div className="p-2">
                    {tablesData.tables.map((t) => (
                      <button
                        key={t}
                        onClick={() => { setSelectedTable(t); setTableSubTab('schema'); }}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left',
                          selectedTable === t
                            ? 'bg-primary/10 text-primary'
                            : 'text-text-secondary hover:bg-bg-hover/50 hover:text-text-primary'
                        )}
                      >
                        <Table2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate font-mono text-xs">{t}</span>
                        {selectedTable === t && <ChevronRight className="w-3.5 h-3.5 ml-auto shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            {/* Table Detail */}
            <div className="lg:col-span-3">
              {!selectedTable ? (
                <Card>
                  <div className="text-center py-16">
                    <Table2 className="w-10 h-10 text-text-muted mx-auto mb-3" />
                    <p className="text-sm text-text-muted font-medium">테이블을 선택하면 스키마와 데이터를 확인할 수 있습니다</p>
                  </div>
                </Card>
              ) : (
                <Card padding="none" className="overflow-hidden">
                  <div className="p-5 border-b border-border/30">
                    <div className="flex items-center gap-3 mb-4">
                      <Table2 className="w-4 h-4 text-primary" />
                      <span className="font-bold text-text-primary font-mono">{selectedTable}</span>
                    </div>
                    <TabList>
                      <TabTrigger active={tableSubTab === 'schema'} onClick={() => setTableSubTab('schema')} >
                        <span className="flex items-center gap-1.5"><Code2 className="w-3.5 h-3.5" />스키마</span>
                      </TabTrigger>
                      <TabTrigger active={tableSubTab === 'preview'} onClick={() => setTableSubTab('preview')}>
                        <span className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />미리보기</span>
                      </TabTrigger>
                    </TabList>
                  </div>

                  {/* Schema Sub-tab */}
                  {tableSubTab === 'schema' && (
                    <div className="p-5">
                      {schemaLoading ? (
                        <div className="space-y-2">
                          {[1, 2, 3, 4].map((i) => <div key={i} className="h-10 rounded-xl bg-bg-elevated/40 animate-pulse" />)}
                        </div>
                      ) : schema ? (
                        <>
                          {/* DDL */}
                          {schema.ddl && (
                            <div className="mb-5">
                              <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-[0.12em] mb-3">테이블 정의 (DDL)</h4>
                              <pre className="bg-[#0d0d0f] border border-border/30 rounded-xl p-4 text-xs text-text-secondary font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap">
                                {schema.ddl}
                              </pre>
                            </div>
                          )}
                          {/* Columns */}
                          <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-[0.12em] mb-3">
                            컬럼 ({schema.columns.length}개)
                          </h4>
                          <div className="space-y-1.5">
                            {schema.columns.map((col, i) => (
                              <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-bg-elevated/30 hover:bg-bg-elevated/50 transition-colors">
                                {col.primary_key && (
                                  <span className="text-[10px] font-bold text-warning bg-warning/10 px-1.5 py-0.5 rounded">PK</span>
                                )}
                                <span className="font-mono text-sm text-text-primary font-medium">{col.name}</span>
                                <span className="font-mono text-xs text-primary/80 ml-1">{col.type}</span>
                                {col.nullable && (
                                  <span className="text-[10px] font-bold text-text-muted uppercase ml-auto">nullable</span>
                                )}
                                {col.default !== null && col.default !== undefined && (
                                  <span className="text-[10px] text-text-muted font-mono">default: {String(col.default)}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      ) : null}
                    </div>
                  )}

                  {/* Preview Sub-tab */}
                  {tableSubTab === 'preview' && (
                    <div className="p-5">
                      {previewLoading ? (
                        <div className="space-y-2">
                          {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-xl bg-bg-elevated/40 animate-pulse" />)}
                        </div>
                      ) : preview ? (
                        preview.rows.length === 0 ? (
                          <div className="text-center py-10 text-sm text-text-muted font-medium">이 테이블에 데이터가 없습니다</div>
                        ) : (
                          <div className="overflow-x-auto rounded-xl border border-border/30">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-border/30 bg-bg-elevated/50">
                                  {preview.columns.map((col) => (
                                    <th key={col} className="px-4 py-3 text-left font-bold text-text-muted uppercase tracking-wider whitespace-nowrap">
                                      {col}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {preview.rows.map((row, ri) => (
                                  <tr key={ri} className="border-b border-border/20 hover:bg-bg-hover/30 transition-colors">
                                    {(row as unknown[]).map((cell, ci) => (
                                      <td key={ci} className="px-4 py-3 font-mono text-text-secondary max-w-[200px] truncate">
                                        {cell === null || cell === undefined
                                          ? <span className="italic text-text-muted">NULL</span>
                                          : String(cell)}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <p className="px-4 py-2 text-[11px] text-text-muted border-t border-border/20">
                              {preview.rows.length}개 행 표시 (최대 10개)
                            </p>
                          </div>
                        )
                      ) : null}
                    </div>
                  )}
                </Card>
              )}
            </div>
          </div>
        </TabContent>
      </div>
    </div>
  );
}
