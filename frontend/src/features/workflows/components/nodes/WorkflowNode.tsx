import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { Zap, Settings, Database, GitBranch, Merge, Code2, FileText } from 'lucide-react'

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
  report:    { color: '#10B981', iconBg: '#10B981', Icon: FileText,  label: 'Report'    },
}

/* Obsidian theme tokens — elevated card with soft transparency */
const OBS = {
  cardBg: 'rgba(26, 26, 31, 0.82)',
  cardSolid: '#1a1a1f',
  border: '#2a2a32',
  borderLight: '#35353f',
  primary: '#00d4ff',
}

const EXEC_STATUS_STYLES: Record<string, { ring: string; badge: string }> = {
  running: { ring: `ring-2 ring-amber-400/70 ring-offset-1 ring-offset-[${OBS.cardSolid}]`, badge: 'bg-amber-400' },
  success: { ring: `ring-2 ring-emerald-400/70 ring-offset-1 ring-offset-[${OBS.cardSolid}]`, badge: 'bg-emerald-400' },
  failed:  { ring: `ring-2 ring-red-400/70 ring-offset-1 ring-offset-[${OBS.cardSolid}]`, badge: 'bg-red-400' },
  skipped: { ring: `ring-2 ring-zinc-500/50 ring-offset-1 ring-offset-[${OBS.cardSolid}]`, badge: 'bg-zinc-500' },
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
  if (etype === 'html') return ['html', 'title']
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
      {/* Main card — n8n layout + Obsidian theme */}
      <div
        className={`
          relative flex items-stretch rounded-2xl overflow-hidden
          transition-all duration-200 cursor-pointer
          ${statusStyle?.ring || ''}
          ${selected
            ? `shadow-[0_0_0_1.5px_rgba(0,212,255,0.5),0_8px_40px_rgba(0,0,0,0.7)]`
            : 'shadow-[0_2px_20px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.03)] hover:shadow-[0_4px_32px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.06)]'}
        `}
        style={{
          background: OBS.cardBg,
          backdropFilter: 'blur(16px)',
          border: `1px solid ${selected ? 'rgba(0,212,255,0.35)' : OBS.border}`,
          minWidth: 200,
        }}
      >
        {/* Icon section — large colored block */}
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{ width: 56, background: iconBg }}
        >
          <Icon size={24} className="text-white" />
        </div>

        {/* Content section */}
        <div className="flex-1 min-w-0 px-3 py-2.5">
          {/* Type label */}
          <div
            className="text-[9px] font-bold uppercase tracking-[0.12em] mb-0.5 opacity-60"
            style={{ color }}
          >
            {meta.label}
          </div>

          {/* Node name */}
          <div className="text-[13px] font-semibold text-[#f0f0f0] truncate leading-tight">
            {nodeData.label}
          </div>

          {/* Output fields preview */}
          {outputFields.length > 0 && (
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              {outputFields.map((f) => (
                <span
                  key={f}
                  className="text-[9px] font-mono px-1.5 py-0.5 rounded-md text-[#5a5a65]"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                >
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Execution status indicator — top-right */}
        {execStatus && (
          <div className="absolute top-2 right-2">
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
          className="!w-4 !h-4 !rounded-full !border-[2.5px] transition-all duration-150"
          style={{
            background: OBS.cardSolid,
            borderColor: OBS.borderLight,
            left: -8,
            zIndex: 20,
          }}
        />
      )}

      {/* Output handles */}
      {isCondition ? (
        <>
          <Handle
            id="true"
            type="source"
            position={Position.Right}
            className="!w-4 !h-4 !rounded-full !border-[2.5px] transition-all duration-150"
            style={{ top: '30%', right: -8, background: OBS.cardSolid, borderColor: '#00C48C', zIndex: 20 }}
          />
          <Handle
            id="false"
            type="source"
            position={Position.Right}
            className="!w-4 !h-4 !rounded-full !border-[2.5px] transition-all duration-150"
            style={{ top: '70%', right: -8, background: OBS.cardSolid, borderColor: '#EF4444', zIndex: 20 }}
          />
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
          className="!w-4 !h-4 !rounded-full !border-[2.5px] transition-all duration-150"
          style={{
            background: OBS.cardSolid,
            borderColor: OBS.borderLight,
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
  reportNode: WorkflowNode,
}
