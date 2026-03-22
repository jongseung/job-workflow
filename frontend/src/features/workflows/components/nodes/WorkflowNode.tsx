import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { Zap, Settings, Database, GitBranch, Merge, Code2 } from 'lucide-react'

type LucideIcon = React.ComponentType<{ className?: string; size?: number; style?: React.CSSProperties }>

export const NODE_TYPE_META: Record<string, {
  color: string
  iconBg: string
  Icon: LucideIcon
  label: string
}> = {
  trigger:   { color: '#FF6D5A', iconBg: '#FF6D5A', Icon: Zap,       label: 'Trigger'   },
  action:    { color: '#FF9F43', iconBg: '#FF9F43', Icon: Settings,  label: 'Action'    },
  data:      { color: '#7C5CFC', iconBg: '#7C5CFC', Icon: Database,  label: 'Data'      },
  transform: { color: '#00C48C', iconBg: '#00C48C', Icon: Code2,     label: 'Transform' },
  condition: { color: '#E056A0', iconBg: '#E056A0', Icon: GitBranch, label: 'Condition' },
  merge:     { color: '#9B8AFB', iconBg: '#9B8AFB', Icon: Merge,     label: 'Merge'     },
}

const EXEC_STATUS_STYLES: Record<string, { ring: string; badge: string; text: string }> = {
  running: { ring: 'ring-2 ring-amber-400/70 ring-offset-1 ring-offset-[#1e1e2e]', badge: 'bg-amber-400', text: 'text-amber-200' },
  success: { ring: 'ring-2 ring-emerald-400/70 ring-offset-1 ring-offset-[#1e1e2e]', badge: 'bg-emerald-400', text: 'text-emerald-200' },
  failed:  { ring: 'ring-2 ring-red-400/70 ring-offset-1 ring-offset-[#1e1e2e]', badge: 'bg-red-400', text: 'text-red-200' },
  skipped: { ring: 'ring-2 ring-zinc-500/50 ring-offset-1 ring-offset-[#1e1e2e]', badge: 'bg-zinc-500', text: 'text-zinc-400' },
}

export interface WorkflowNodeData {
  label: string
  moduleType: string
  moduleId: string | null
  config: Record<string, unknown>
  inputMapping: Record<string, unknown>
  icon?: string
  color?: string
  category?: string
  executorType?: string
  outputSchema?: Record<string, unknown> | null
  executionStatus?: 'running' | 'success' | 'failed' | 'skipped'
  [key: string]: unknown
}

/** Extract top-level field names from an output schema or executor type. */
function getOutputFields(nodeData: WorkflowNodeData): string[] {
  if (nodeData.outputSchema?.properties) {
    const props = nodeData.outputSchema.properties as Record<string, unknown>
    return Object.keys(props).slice(0, 4)
  }
  const etype = nodeData.executorType
  if (etype === 'sql') return ['rows', 'count']
  if (etype === 'http') return ['result']
  if (etype === 'python') return ['result']
  if (nodeData.moduleType === 'condition') return ['_branch']
  return []
}

function WorkflowNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as WorkflowNodeData
  const meta = NODE_TYPE_META[nodeData.moduleType] || NODE_TYPE_META.action
  const { Icon, color, iconBg } = meta
  const execStatus = nodeData.executionStatus
  const isCondition = nodeData.moduleType === 'condition'
  const isTrigger = nodeData.moduleType === 'trigger'
  const outputFields = getOutputFields(nodeData)
  const statusStyle = execStatus ? EXEC_STATUS_STYLES[execStatus] : null

  return (
    <div className="group relative select-none">
      {/* Main card — n8n style */}
      <div
        className={`
          relative flex items-stretch rounded-2xl overflow-hidden
          transition-all duration-200 cursor-pointer
          ${statusStyle?.ring || ''}
          ${selected
            ? 'shadow-[0_0_0_2px_rgba(124,92,252,0.6),0_8px_40px_rgba(0,0,0,0.5)]'
            : 'shadow-[0_2px_12px_rgba(0,0,0,0.4)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.5)]'}
        `}
        style={{
          background: '#1e1e2e',
          border: `1px solid ${selected ? 'rgba(124,92,252,0.4)' : 'rgba(255,255,255,0.06)'}`,
          minWidth: 200,
        }}
      >
        {/* Icon section — large colored square */}
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 56,
            background: iconBg,
          }}
        >
          <Icon size={24} className="text-white" />
        </div>

        {/* Content section */}
        <div className="flex-1 min-w-0 px-3 py-2.5">
          {/* Type label */}
          <div
            className="text-[9px] font-bold uppercase tracking-[0.12em] mb-0.5 opacity-50"
            style={{ color }}
          >
            {meta.label}
          </div>

          {/* Node name */}
          <div className="text-[13px] font-semibold text-white/90 truncate leading-tight">
            {nodeData.label}
          </div>

          {/* Output fields preview */}
          {outputFields.length > 0 && (
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              {outputFields.map((f) => (
                <span
                  key={f}
                  className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-white/5 text-white/30"
                >
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Execution status indicator — top-right dot */}
        {execStatus && (
          <div className="absolute top-2 right-2 flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${statusStyle?.badge} ${execStatus === 'running' ? 'animate-pulse' : ''}`} />
          </div>
        )}
      </div>

      {/* ─── Handles ─── */}

      {/* Input handle — left */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="
            !w-4 !h-4 !rounded-full !border-[2.5px] !bg-[#1e1e2e]
            hover:!border-[#7C5CFC] hover:!bg-[#7C5CFC]/20
            transition-all duration-150
          "
          style={{
            borderColor: 'rgba(255,255,255,0.15)',
            left: -8,
            zIndex: 20,
          }}
        />
      )}

      {/* Output handles */}
      {isCondition ? (
        <>
          {/* True branch — green */}
          <Handle
            id="true"
            type="source"
            position={Position.Right}
            className="!w-4 !h-4 !rounded-full !border-[2.5px] transition-all duration-150"
            style={{
              top: '30%',
              right: -8,
              background: '#1e1e2e',
              borderColor: '#00C48C',
              zIndex: 20,
            }}
          />
          {/* False branch — red */}
          <Handle
            id="false"
            type="source"
            position={Position.Right}
            className="!w-4 !h-4 !rounded-full !border-[2.5px] transition-all duration-150"
            style={{
              top: '70%',
              right: -8,
              background: '#1e1e2e',
              borderColor: '#EF4444',
              zIndex: 20,
            }}
          />
          {/* Branch labels */}
          <div
            className="absolute text-[9px] font-bold tracking-wider pointer-events-none"
            style={{ right: -30, top: 'calc(30% - 6px)', color: '#00C48C', zIndex: 20 }}
          >
            T
          </div>
          <div
            className="absolute text-[9px] font-bold tracking-wider pointer-events-none"
            style={{ right: -28, top: 'calc(70% - 6px)', color: '#EF4444', zIndex: 20 }}
          >
            F
          </div>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="
            !w-4 !h-4 !rounded-full !border-[2.5px] !bg-[#1e1e2e]
            hover:!border-[#7C5CFC] hover:!bg-[#7C5CFC]/20
            transition-all duration-150
          "
          style={{
            borderColor: 'rgba(255,255,255,0.15)',
            right: -8,
            zIndex: 20,
          }}
        />
      )}
    </div>
  )
}

export const WorkflowNode = memo(WorkflowNodeComponent)
WorkflowNode.displayName = 'WorkflowNode'

export const nodeTypes = {
  workflowNode: WorkflowNode,
  triggerNode: WorkflowNode,
  actionNode: WorkflowNode,
  dataNode: WorkflowNode,
  transformNode: WorkflowNode,
  conditionNode: WorkflowNode,
  mergeNode: WorkflowNode,
}
