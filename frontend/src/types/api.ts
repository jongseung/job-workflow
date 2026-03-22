export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'operator' | 'viewer';
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface Job {
  id: string;
  name: string;
  description: string | null;
  code: string;
  code_filename: string | null;
  schedule_type: 'cron' | 'interval' | 'manual';
  cron_expression: string | null;
  interval_seconds: number | null;
  is_active: boolean;
  max_retries: number;
  retry_delay_seconds: number;
  timeout_seconds: number;
  environment_vars: Record<string, string> | null;
  tags: string[] | null;
  datasource_id: string | null;
  save_to_datasource: boolean;
  target_table: string | null;
  output_format: 'jsonl' | 'csv';
  write_mode: 'append' | 'replace' | 'upsert';
  upsert_key: string | null;
  notify_webhook_url: string | null;
  notify_on: 'success' | 'failure' | 'both' | 'none';
  priority: number;
  requirements: string | null;
  max_concurrent: number;
  depends_on: string[] | null;
  created_by: string | null;
  created_by_name: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string | null;
  last_run_status: string | null;
  next_run_time: string | null;
}

export interface DataSource {
  id: string;
  name: string;
  description: string | null;
  db_type: 'postgresql' | 'mysql' | 'mssql' | 'sqlite';
  host: string | null;
  port: number | null;
  database: string;
  username: string | null;
  ssl_mode: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latency_ms: number | null;
}

export interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  primary_key?: boolean;
}

export interface TableSchema {
  table_name: string;
  ddl: string;
  columns: TableColumn[];
}

export interface TablePreview {
  columns: string[];
  rows: unknown[][];
}

export interface ValidateOutputResult {
  valid: boolean;
  matched: string[];
  missing: string[];
  extra: string[];
  table_columns: TableColumn[];
  message: string;
}

export interface JobListItem {
  id: string;
  name: string;
  description: string | null;
  schedule_type: string;
  is_active: boolean;
  tags: string[] | null;
  created_by_name: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string | null;
  last_run_status: string | null;
  last_run_at: string | null;
}

export interface JobRun {
  id: string;
  job_id: string;
  status: 'pending' | 'queued' | 'running' | 'success' | 'failed' | 'cancelled' | 'retrying' | 'skipped';
  trigger_type: 'scheduled' | 'manual' | 'retry' | 'dependency';
  attempt_number: number;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  exit_code: number | null;
  error_message: string | null;
  triggered_by: string | null;
  queued_at: string | null;
  worker_id: string | null;
  created_at: string;
  job_name?: string;
}

export interface JobLog {
  id: number;
  job_run_id: string;
  timestamp: string;
  stream: 'stdout' | 'stderr' | 'system';
  level: 'debug' | 'info' | 'warning' | 'error';
  message: string;
  line_number: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface SystemStats {
  total_jobs: number;
  active_jobs: number;
  total_runs: number;
  success_runs: number;
  failed_runs: number;
  running_now: number;
  success_rate: number;
  db_size_bytes: number;
  scheduler_running: boolean;
  scheduled_jobs: number;
  uptime_seconds: number;
  // Workflow stats
  total_workflows: number;
  active_workflows: number;
  wf_total_runs: number;
  wf_success_runs: number;
  wf_failed_runs: number;
  wf_running_now: number;
  wf_success_rate: number;
}

export interface QueueStatus {
  queued_runs: QueuedRun[];
  active_workers: number;
  max_workers: number;
  queued_count: number;
  lock_status: Record<string, number>;
}

export interface QueuedRun {
  run_id: string;
  job_id: string;
  job_name: string;
  priority: number;
  queued_at: string | null;
  position: number;
}

export interface AnalysisResult {
  is_valid: boolean;
  imports: ImportInfo[];
  functions: FunctionInfo[];
  classes: ClassInfo[];
  warnings: CodeWarning[];
  total_lines: number;
  has_main_guard: boolean;
  syntax_error: string | null;
}

export interface ImportInfo {
  module: string;
  alias: string | null;
  is_stdlib: boolean;
  is_third_party: boolean;
  names: string[] | null;
}

export interface FunctionInfo {
  name: string;
  line_number: number;
  args: string[];
  docstring: string | null;
  is_async: boolean;
}

export interface ClassInfo {
  name: string;
  line_number: number;
  bases: string[];
  methods: string[];
  docstring: string | null;
}

export interface CodeWarning {
  line_number: number | null;
  message: string;
  severity: 'warning' | 'error' | 'info';
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface AuditEntry {
  id: number;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface RunHistoryPoint {
  date: string;
  success: number;
  failed: number;
  cancelled: number;
  running: number;
  pending: number;
}
