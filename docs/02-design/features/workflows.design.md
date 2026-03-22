# Design: Workflow Node User Configuration

## 1. Architecture Overview

### Data Flow

```
Canvas Node (React Flow)
  └── node.data = {
        label, moduleType, moduleId,
        config: { <executor-specific + output settings> },
        inputMapping: { <field → node_output | static | initial> }
      }
          │
          ▼
WorkflowEditorPage.saveWorkflow()
  └── workflowsApi.update(id, { canvas_data })
          │
          ▼
Backend: workflow_execution_service._execute_node()
  └── full_input = merge(node.config, resolved(inputMapping))
  └── _route_executor(node_type, module, full_input, node_data)
        ├── _run_sql(module, input, node_data)    ← reads node_data.config
        ├── _run_http(module, input, node_data)   ← reads node_data.config
        ├── _run_python(module, input, node_data) ← reads node_data.config
        └── (after output) _save_node_output()   ← if config.save_output
```

---

## 2. Backend Changes

### 2.1 `workflow_execution_service.py`

#### `_route_executor` signature change
```python
async def _route_executor(node_type, module, input_data, node_data) -> dict:
    # node_data passed through to all sub-executors
```

#### `_run_sql` — node config override
```python
async def _run_sql(module, input_data, node_data) -> dict:
    node_cfg = (node_data.get("config") or {})
    mod_cfg  = (module.executor_config or {}) if module else {}

    datasource_id = node_cfg.get("datasource_id") or mod_cfg.get("datasource_id")
    query = node_cfg.get("query") or (module.executor_code if module else None) or mod_cfg.get("query", "")

    if not datasource_id:
        raise ValueError("SQL 노드에 데이터소스가 설정되지 않았습니다")
    if not query:
        raise ValueError("SQL 노드에 쿼리가 없습니다")

    # ... execute query (existing logic) ...

    # Output saving
    if node_cfg.get("save_output") and node_cfg.get("output_datasource_id"):
        await _save_node_output(
            datasource_id=node_cfg["output_datasource_id"],
            table=node_cfg.get("output_table", "workflow_output"),
            rows=rows,
            write_mode=node_cfg.get("output_write_mode", "append"),
        )

    return {"rows": rows, "count": len(rows), "columns": col_names}
```

#### `_run_http` — node config override
```python
async def _run_http(module, input_data, node_data) -> dict:
    node_cfg = (node_data.get("config") or {})
    mod_cfg  = (module.executor_config or {}) if module else {}

    url     = node_cfg.get("url")     or mod_cfg.get("url", "")
    method  = (node_cfg.get("method") or mod_cfg.get("method", "POST")).upper()
    headers = {**(mod_cfg.get("headers") or {}), **(node_cfg.get("headers") or {})}
    body    = node_cfg.get("body_template") or input_data

    # Template substitution
    for k, v in input_data.items():
        url = url.replace(f"{{{k}}}", str(v))

    # ... execute (existing httpx logic) ...

    # Output saving
    if node_cfg.get("save_output") and node_cfg.get("output_datasource_id"):
        result_rows = result if isinstance(result, list) else [result]
        await _save_node_output(...)

    return result
```

#### `_run_python` — node config override
```python
async def _run_python(module, input_data, node_data) -> dict:
    node_cfg = (node_data.get("config") or {})
    code = node_cfg.get("code") or (module.executor_code if module else "") or ""

    if not code:
        raise ValueError("Python 노드에 코드가 없습니다")

    result = await _execute_python_code(code, input_data)

    if node_cfg.get("save_output") and node_cfg.get("output_datasource_id"):
        rows = result if isinstance(result, list) else [result]
        await _save_node_output(...)

    return result
```

#### `_save_node_output` (new function)
```python
async def _save_node_output(datasource_id: str, table: str, rows: list[dict], write_mode: str = "append"):
    """Reuses datasource_service.insert_rows_to_table() — same as job-scheduler pattern."""
    from app.services.datasource_service import insert_rows_to_table
    from app.models.datasource import DataSource

    db = SessionLocal()
    try:
        ds = db.query(DataSource).filter(DataSource.id == datasource_id).first()
        if not ds:
            raise ValueError(f"Output datasource {datasource_id} not found")
        insert_rows_to_table(ds, table, rows, mode=write_mode)
    finally:
        db.close()
```

### 2.2 `routers/workflows.py` — Node Test Endpoint

```python
class NodeTestRequest(BaseModel):
    node_data: dict          # Full node.data from canvas
    input_data: dict = {}    # Mock upstream data for testing

@router.post("/{workflow_id}/nodes/{node_id}/test")
async def test_node(
    workflow_id: str,
    node_id: str,
    body: NodeTestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Execute a single node in isolation for testing."""
    from app.services.workflow_execution_service import _route_executor
    from app.models.module import StepModule

    nd = body.node_data
    module_id = nd.get("moduleId")
    module = db.query(StepModule).filter(StepModule.id == module_id).first() if module_id else None
    node_type = nd.get("moduleType", "action")
    full_input = {**(nd.get("config") or {}), **body.input_data}

    try:
        output = await _route_executor(node_type, module, full_input, nd)
        return {"status": "success", "output": output}
    except Exception as e:
        return {"status": "error", "error": str(e)}
```

### 2.3 `routers/datasources.py` — Query Preview Endpoint

```python
class QueryPreviewRequest(BaseModel):
    query: str
    params: list = []

@router.post("/{datasource_id}/query-preview")
def query_preview(
    datasource_id: str,
    body: QueryPreviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Execute a SQL query with forced LIMIT 50 for preview."""
    from app.services.datasource_service import _get_connection

    ds = svc.get_datasource(db, datasource_id)
    conn, _ = _get_connection(ds)
    try:
        cur = conn.cursor()
        # Wrap with limit for safety
        safe_query = f"SELECT * FROM ({body.query.rstrip(';')}) AS __preview__ LIMIT 50"
        cur.execute(safe_query, body.params or [])
        col_names = [d[0] for d in (cur.description or [])]
        rows = [
            {c: (cell.isoformat() if hasattr(cell, "isoformat") else cell)
             for c, cell in zip(col_names, row)}
            for row in cur.fetchall()
        ]
        return {"rows": rows, "count": len(rows), "columns": col_names}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()
```

---

## 3. Frontend Component Design

### 3.1 File Structure

```
frontend/src/features/workflows/components/
  config/
    DataSourceSelect.tsx      ← Datasource dropdown (uses existing /datasources API)
    TableBrowser.tsx           ← Table list + schema + preview
    KeyValueEditor.tsx         ← Headers / custom KV editor
    SqlConfigEditor.tsx        ← Full SQL config panel
    HttpConfigEditor.tsx       ← HTTP request builder
    PythonConfigEditor.tsx     ← Python Monaco code editor
    OutputConfigSection.tsx    ← Save-to-DB settings (shared across all)
    NodeTestPanel.tsx          ← Test button + result display
```

### 3.2 Component Interfaces

#### DataSourceSelect
```tsx
interface DataSourceSelectProps {
  value: string | null
  onChange: (id: string | null, name: string) => void
  placeholder?: string
}
```

#### TableBrowser
```tsx
interface TableBrowserProps {
  datasourceId: string | null
  onSelectTable: (tableName: string) => void
}
// Shows: list of tables, clicking table → shows columns
```

#### KeyValueEditor
```tsx
interface KeyValueEditorProps {
  value: Record<string, string>
  onChange: (v: Record<string, string>) => void
  placeholder?: { key: string; value: string }
}
```

#### SqlConfigEditor
```tsx
interface SqlConfigEditorProps {
  config: Partial<SqlConfig>
  onChange: (updates: Partial<SqlConfig>) => void
}
interface SqlConfig {
  datasource_id: string | null
  query: string
}
```

#### HttpConfigEditor
```tsx
interface HttpConfigEditorProps {
  config: Partial<HttpConfig>
  onChange: (updates: Partial<HttpConfig>) => void
}
interface HttpConfig {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers: Record<string, string>
  body_template: string  // JSON string in editor
}
```

#### PythonConfigEditor
```tsx
interface PythonConfigEditorProps {
  code: string
  onChange: (code: string) => void
  defaultCode?: string  // from module.executor_code
}
```

#### OutputConfigSection
```tsx
interface OutputConfigSectionProps {
  config: Partial<OutputConfig>
  onChange: (updates: Partial<OutputConfig>) => void
}
interface OutputConfig {
  save_output: boolean
  output_datasource_id: string | null
  output_table: string
  output_write_mode: 'append' | 'replace' | 'upsert'
}
```

#### NodeTestPanel
```tsx
interface NodeTestPanelProps {
  workflowId: string
  nodeId: string
  nodeData: WorkflowNodeData
  moduleInfo: StepModule | null
}
// Shows: [▶ 테스트 실행] button, result/error display
```

### 3.3 NodeConfigPanel — Config Tab Logic

```tsx
// Config tab rendering — detect executor type from moduleInfo
const executorType = moduleInfo?.executor_type ?? 'builtin'
const moduleType = nodeData.moduleType

// Route to appropriate editor
{activeTab === 'config' && (
  <div className="space-y-4">
    {moduleType === 'condition' && <ConditionEditor ... />}

    {executorType === 'sql' && (
      <SqlConfigEditor
        config={nodeData.config}
        onChange={(updates) => handleConfigBatch(updates)}
      />
    )}

    {executorType === 'http' && (
      <HttpConfigEditor
        config={nodeData.config}
        onChange={(updates) => handleConfigBatch(updates)}
      />
    )}

    {executorType === 'python' && (
      <PythonConfigEditor
        code={(nodeData.config?.code as string) || moduleInfo?.executor_code || ''}
        onChange={(code) => handleConfigChange('code', code)}
        defaultCode={moduleInfo?.executor_code || ''}
      />
    )}

    {/* Trigger: initial data JSON */}
    {moduleType === 'trigger' && (
      <TriggerConfigEditor ... />
    )}

    {/* Output saving — all types */}
    {moduleType !== 'condition' && moduleType !== 'trigger' && (
      <OutputConfigSection
        config={nodeData.config}
        onChange={(updates) => handleConfigBatch(updates)}
      />
    )}

    {/* Node test */}
    <NodeTestPanel
      workflowId={workflowId}
      nodeId={node.id}
      nodeData={nodeData}
      moduleInfo={moduleInfo}
    />
  </div>
)}
```

---

## 4. workflows.ts API Additions

```typescript
// New types
export interface NodeTestRequest {
  node_data: CanvasNode['data']
  input_data?: Record<string, unknown>
}
export interface NodeTestResult {
  status: 'success' | 'error'
  output?: Record<string, unknown>
  error?: string
}
export interface QueryPreviewResult {
  rows: Record<string, unknown>[]
  count: number
  columns: string[]
}

// New API calls
export const workflowsApi = {
  // ... existing ...
  testNode: (workflowId: string, nodeId: string, data: NodeTestRequest) =>
    apiClient.post<NodeTestResult>(`/workflows/${workflowId}/nodes/${nodeId}/test`, data),
}

// Added to datasources.ts or workflows.ts
export const queryPreview = (datasourceId: string, query: string) =>
  apiClient.post<QueryPreviewResult>(`/datasources/${datasourceId}/query-preview`, { query })
```

---

## 5. Monaco Editor Integration

`@monaco-editor/react` is already available (used in `ModuleFormPage.tsx`). Reuse the same import pattern:

```tsx
import MonacoEditor from '@monaco-editor/react'

<MonacoEditor
  height="200px"
  language="sql"   // or "python" or "json"
  theme="vs-dark"
  value={query}
  onChange={(v) => onChange(v || '')}
  options={{
    minimap: { enabled: false },
    fontSize: 12,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    automaticLayout: true,
  }}
/>
```

---

## 6. Design System Rules for New Components

- **Colors**: Use CSS variables (`bg-bg-card`, `bg-bg-tertiary`, `border-border`, `text-text-muted`, `text-primary`, etc.)
- **No hardcoded hex**: No `#0D1117`, `#848D97`, `#E6EDF3` etc.
- **No custom fonts**: No `fontFamily: 'Barlow...'` or `'JetBrains Mono'`
- **Icons**: Lucide React only (`Database`, `Globe`, `Code`, `ChevronDown`, `Play`, `Check`, `X`, etc.)
- **Buttons**: Use `<Button>` component or matching `className` patterns
- **Labels**: `text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5`
- **Inputs**: `bg-bg-tertiary rounded-lg px-3 py-1.5 text-[12px] text-text-primary outline-none border border-border focus:border-primary/50 transition-colors`
- **Section dividers**: `border-t border-border pt-4 mt-4`

---

## 7. Implementation Notes

### handleConfigBatch helper (NodeConfigPanel)
```tsx
const handleConfigBatch = (updates: Record<string, unknown>) => {
  onUpdateNode(node.id, {
    config: { ...(nodeData.config || {}), ...updates },
  })
}
```

### WorkflowEditorPage — pass workflowId to NodeConfigPanel
NodeTestPanel needs `workflowId` for the test API call. Pass it from WorkflowEditorPage:
```tsx
<NodeConfigPanel
  node={selectedNode}
  workflowId={workflowId}   // ← add this prop
  // ...
/>
```

### MappableInput fixes
- Remove `fontFamily: "'Barlow Condensed', sans-serif"` → remove or use `font-mono` class
- Replace `fontFamily: "'JetBrains Mono', monospace"` → `font-mono` class
- Replace `style={{ background: '#0D1117' }}` → `className="bg-bg-card"`
- Replace `style={{ color: '#484F58' }}` → `className="text-text-muted"`
- Replace `style={{ color: '#E6EDF3' }}` → `className="text-text-primary"`
- Replace `text-white/80`, `text-white/30` → `text-text-secondary`, `text-text-muted`
- Replace `border-white/10` → `border-border`
- Replace `bg-white/5` → `bg-bg-hover`
- Replace `bg-indigo-950/40` → `bg-primary/5`
- Replace `border-indigo-400/60` → `border-primary/50`
- `meta.icon` reference (emoji) → render `<meta.Icon size={11} />` component

---

## 8. Key Constraints

- No new npm packages (Monaco already installed)
- No changes to existing data models or DB schema
- Backward compatible: existing workflows without node config still work (module fallback)
- `executor_code` / `executor_config` at module level remain as defaults/templates
