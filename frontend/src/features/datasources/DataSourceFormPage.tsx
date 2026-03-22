/**
 * Shared form component used by both Create and Edit datasource pages.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Database, CheckCircle2, XCircle, Loader2, Wifi } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button, Card, CardHeader, Input, FormField } from '@/components/ui';
import { Select } from '@/components/ui/Input';
import {
  createDataSource, updateDataSource, getDataSource, testConnection, testSavedConnection
} from '@/api/datasources';
import type { DataSource, ConnectionTestResult } from '@/types/api';
import { cn } from '@/lib/utils';

interface FormState {
  name: string;
  description: string;
  db_type: string;
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  ssl_mode: string;
}

const DEFAULT_PORTS: Record<string, string> = {
  postgresql: '5432',
  mysql: '3306',
  mssql: '1433',
  sqlite: '',
};

interface Props {
  mode: 'create' | 'edit';
}

export function DataSourceFormPage({ mode }: Props) {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>({
    name: '',
    description: '',
    db_type: 'postgresql',
    host: 'localhost',
    port: '5432',
    database: '',
    username: '',
    password: '',
    ssl_mode: '',
  });

  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  // Load existing datasource in edit mode
  const { data: existing } = useQuery({
    queryKey: ['datasource', id],
    queryFn: () => getDataSource(id!),
    enabled: mode === 'edit' && !!id,
  });

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name,
        description: existing.description || '',
        db_type: existing.db_type,
        host: existing.host || '',
        port: existing.port?.toString() || DEFAULT_PORTS[existing.db_type] || '',
        database: existing.database,
        username: existing.username || '',
        password: '', // never pre-populate
        ssl_mode: existing.ssl_mode || '',
      });
    }
  }, [existing]);

  const mutation = useMutation({
    mutationFn: (data: any) =>
      mode === 'create' ? createDataSource(data) : updateDataSource(id!, data),
    onSuccess: (ds) => {
      queryClient.invalidateQueries({ queryKey: ['datasources'] });
      navigate(`/datasources/${ds.id}`);
    },
  });

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    setForm((prev) => {
      const next = { ...prev, [field]: val };
      // Auto-fill port when db_type changes
      if (field === 'db_type') {
        next.port = DEFAULT_PORTS[val] || '';
      }
      return next;
    });
    setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      let result: ConnectionTestResult;
      if (mode === 'edit' && id && !form.password) {
        // Test using saved (encrypted) credentials
        result = await testSavedConnection(id);
      } else {
        result = await testConnection({
          db_type: form.db_type,
          host: form.db_type !== 'sqlite' ? form.host || null : null,
          port: form.port ? parseInt(form.port) : null,
          database: form.database,
          username: form.username || null,
          password: form.password || null,
          ssl_mode: form.ssl_mode || null,
        });
      }
      setTestResult(result);
    } catch (e: any) {
      setTestResult({ success: false, message: e?.response?.data?.detail || String(e), latency_ms: null });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = () => {
    const payload: any = {
      name: form.name,
      description: form.description || undefined,
      db_type: form.db_type,
      database: form.database,
      host: form.db_type !== 'sqlite' ? form.host || undefined : undefined,
      port: form.port ? parseInt(form.port) : undefined,
      username: form.username || undefined,
      ssl_mode: form.ssl_mode || undefined,
    };
    if (form.password) payload.password = form.password;
    mutation.mutate(payload);
  };

  const isSqlite = form.db_type === 'sqlite';
  const isValid = form.name && form.database;

  return (
    <div>
      <Header title={mode === 'create' ? '새 데이터소스' : '데이터소스 수정'} />
      <div className="p-8">
        <Button variant="ghost" size="sm" onClick={() => navigate('/datasources')} icon={ArrowLeft} className="mb-8">
          데이터소스 목록으로
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left — Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Info */}
            <Card>
              <CardHeader title="기본 정보" action={<Database className="w-4 h-4 text-text-muted" />} />
              <div className="space-y-5">
                <FormField label="이름" required hint="데이터소스를 구분할 수 있는 이름">
                  <Input value={form.name} onChange={set('name')} placeholder="운영 DB" />
                </FormField>
                <FormField label="설명" hint="데이터소스에 대한 간단한 설명 (선택사항)">
                  <Input value={form.description} onChange={set('description')} placeholder="예: 운영 환경 PostgreSQL 데이터베이스" />
                </FormField>
                <FormField label="데이터베이스 종류" hint="연결할 데이터베이스 엔진을 선택하세요">
                  <Select value={form.db_type} onChange={set('db_type')}>
                    <option value="postgresql">PostgreSQL</option>
                    <option value="mysql">MySQL / MariaDB</option>
                    <option value="mssql">MSSQL (SQL Server)</option>
                    <option value="sqlite">SQLite</option>
                  </Select>
                </FormField>
              </div>
            </Card>

            {/* Connection Details */}
            <Card>
              <CardHeader title="연결 설정" />
              <div className="space-y-5">
                {isSqlite ? (
                  <FormField label="데이터베이스 파일 경로" required hint="절대 경로 또는 :memory:">
                    <Input
                      value={form.database}
                      onChange={set('database')}
                      placeholder="/path/to/database.db"
                      className="font-mono"
                    />
                  </FormField>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-2">
                        <FormField label="호스트" required hint="서버 주소 (IP 또는 도메인)">
                          <Input value={form.host} onChange={set('host')} placeholder="localhost" />
                        </FormField>
                      </div>
                      <FormField label="포트" hint={`기본값: ${DEFAULT_PORTS[form.db_type] || '—'}`}>
                        <Input type="number" value={form.port} onChange={set('port')} placeholder={DEFAULT_PORTS[form.db_type]} />
                      </FormField>
                    </div>
                    <FormField label="데이터베이스 이름" required hint="연결할 데이터베이스명">
                      <Input value={form.database} onChange={set('database')} placeholder="my_database" />
                    </FormField>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField label="사용자명" hint="DB 접속 계정">
                        <Input value={form.username} onChange={set('username')} placeholder="db_user" autoComplete="off" />
                      </FormField>
                      <FormField label={mode === 'edit' ? '비밀번호 (빈칸이면 기존 유지)' : '비밀번호'}>
                        <Input
                          type="password"
                          value={form.password}
                          onChange={set('password')}
                          placeholder={mode === 'edit' ? '••••••••' : '비밀번호 입력'}
                          autoComplete="new-password"
                        />
                      </FormField>
                    </div>
                    {(form.db_type === 'postgresql' || form.db_type === 'mssql') && (
                      <FormField label="SSL 모드" hint="암호화된 연결 설정">
                        <Select value={form.ssl_mode} onChange={set('ssl_mode')}>
                          <option value="">기본값</option>
                          <option value="disable">비활성화</option>
                          <option value="require">필수</option>
                          {form.db_type === 'postgresql' && <option value="verify-full">전체 검증</option>}
                        </Select>
                      </FormField>
                    )}
                  </>
                )}

                {/* Test Result */}
                {testResult && (
                  <div className={cn(
                    'flex items-start gap-3 p-4 rounded-xl border text-sm font-medium',
                    testResult.success
                      ? 'bg-success/8 border-success/20 text-success'
                      : 'bg-danger/8 border-danger/20 text-danger'
                  )}>
                    {testResult.success
                      ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                      : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                    <div>
                      <p>{testResult.message}</p>
                      {testResult.latency_ms !== null && (
                        <p className="text-xs opacity-70 mt-1">{testResult.latency_ms}ms</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Right — Action Panel */}
          <div className="space-y-4">
            <Card className="sticky top-24 space-y-3">
              <CardHeader title="작업" />
              <Button
                onClick={handleTest}
                disabled={!form.database || testing}
                variant="secondary"
                fullWidth
                icon={testing ? undefined : Wifi}
              >
                {testing ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> 연결 테스트 중...
                  </span>
                ) : '연결 테스트'}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!isValid || mutation.isPending}
                fullWidth
                size="lg"
              >
                {mutation.isPending
                  ? (mode === 'create' ? '생성 중...' : '저장 중...')
                  : (mode === 'create' ? '데이터소스 생성' : '변경사항 저장')}
              </Button>
              {mutation.isError && (
                <p className="text-xs text-danger font-medium bg-danger/8 border border-danger/15 px-4 py-3 rounded-xl">
                  {(mutation.error as any)?.response?.data?.detail || '저장에 실패했습니다'}
                </p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
