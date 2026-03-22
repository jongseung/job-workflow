# Plan: Workflow Node User Configuration

## Executive Summary

| Item | Details |
|------|---------|
| Feature | workflow-node-config |
| Start | 2026-03-21 |
| Target | 2026-03-22 |

### Value Delivered

| Perspective | Content |
|------------|---------|
| Problem | Users can drag nodes onto the workflow canvas but cannot configure their execution details (SQL queries, HTTP endpoints, Python code, DB connections), making workflows non-functional |
| Solution | Executor-type–aware config editors in NodeConfigPanel that let users set datasource, query/code/URL per node instance, plus a DB output section mirroring the job-scheduler pattern |
| Function UX Effect | Each node becomes a fully independent, user-owned unit: click → configure → test → save; SQL nodes show a query editor + table browser; HTTP nodes show a request builder; Python nodes show a code editor |
| Core Value | Admins manage module templates at a high level; users fill in all runtime details to complete real, executable workflows with DB read/write capability |

---

## 1. Background & Context

The workflow engine (v2) backend is fully implemented: DAG execution, 4 executor types (python/http/sql/builtin), ExecutionContext, input mapping. The frontend canvas editor exists with drag-and-drop, node placement, and a basic NodeConfigPanel.

**Current gap**: NodeConfigPanel shows only generic `input_schema` text fields. Users cannot:
- Select a datasource for SQL nodes
- Write or edit SQL queries per node
- Set HTTP URL/method/headers/body per node
- Write custom Python code per node
- Save node output results to a database table

**Reference pattern**: The existing job-scheduler uses `datasource_service.insert_rows_to_table()` for DB output (append/replace/upsert modes) — this exact pattern must be reused for workflow nodes.

---

## 2. Goals

1. **User-configurable node execution** — Each canvas node holds its own runtime config overriding the module template
2. **Datasource integration** — SQL/Data nodes can select a registered datasource and browse tables
3. **DB output** — Any node can save its execution result to a DB table (append/replace/upsert)
4. **Node testing** — Users can test a single node before running the full workflow
5. **Design system consistency** — All new UI uses the existing CSS variable system (no hardcoded colors, no Barlow/JetBrains Mono)

---

## 3. Scope

### In Scope
- NodeConfigPanel: executor-type–aware config editors
- SqlConfigEditor: datasource picker + SQL Monaco editor + table browser
- HttpConfigEditor: URL/method/headers/body builder
- PythonConfigEditor: Monaco code editor
- OutputConfigSection: save-to-DB settings (all node types)
- Backend: node.config override in execution engine
- Backend: `_save_node_output()` using datasource_service
- Backend: `POST /workflows/{id}/nodes/{nodeId}/test` endpoint
- Backend: `POST /datasources/{id}/query-preview` endpoint
- MappableInput: design system alignment (remove Barlow/JetBrains Mono)

### Out of Scope
- New datasource management (already exists)
- Workflow-level scheduling (already exists)
- Real-time streaming node logs (future)

---

## 4. Technical Design Summary

### Node Config Data Shape

```
node.data.config = {
  // SQL executor
  datasource_id: string,
  query: string,

  // HTTP executor
  url: string,
  method: "GET"|"POST"|"PUT"|"DELETE"|"PATCH",
  headers: Record<string, string>,
  body_template: object | null,

  // Python executor
  code: string,

  // Condition (builtin)
  condition: string,

  // Output saving (all types, optional)
  save_output: boolean,
  output_datasource_id: string,
  output_table: string,
  output_write_mode: "append"|"replace"|"upsert",
}
```

### Execution Priority

`node.data.config` values take priority over `module.executor_config` / `module.executor_code`. This allows users to customize each node instance independently from the shared module template.

---

## 5. Implementation Order

| # | Area | File | Description |
|---|------|------|-------------|
| 1 | Backend | `workflow_execution_service.py` | node config override + `_save_node_output()` |
| 2 | Backend | `routers/workflows.py` | `POST /nodes/{nodeId}/test` endpoint |
| 3 | Backend | `routers/datasources.py` | `POST /{id}/query-preview` endpoint |
| 4 | Frontend | `workflows.ts` | New API functions |
| 5 | Frontend | `config/DataSourceSelect.tsx` | Datasource dropdown |
| 6 | Frontend | `config/TableBrowser.tsx` | Table list + schema viewer |
| 7 | Frontend | `config/KeyValueEditor.tsx` | Key-value pair editor |
| 8 | Frontend | `config/SqlConfigEditor.tsx` | SQL node config panel |
| 9 | Frontend | `config/HttpConfigEditor.tsx` | HTTP node config panel |
| 10 | Frontend | `config/PythonConfigEditor.tsx` | Python code editor |
| 11 | Frontend | `config/OutputConfigSection.tsx` | DB output settings |
| 12 | Frontend | `NodeConfigPanel.tsx` | Integrate all editors |
| 13 | Frontend | `MappableInput.tsx` | Design system fix |

---

## 6. Success Criteria

- SQL node: user can select datasource, write query, run workflow → rows returned
- HTTP node: user can set URL/method/headers → workflow calls external API
- Python node: user can write custom code → workflow executes it
- Any node: user can enable "save output" → results written to specified DB table
- Node test: single node test returns output without running full workflow
- Build: `tsc --noEmit` passes, `vite build` succeeds
