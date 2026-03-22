import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { Zap, Settings, Database, RefreshCw, GitBranch, Merge } from 'lucide-react'

type LucideIcon = React.ComponentType<{ className?: string; size?: number; style?: React.CSSProperties }>

export const NODE_TYPE_META: Record<string, {
  color: string
  bg: string
  border: string
  Icon: LucideIcon
  label: string
}> = {
  trigger:   { color: '#22D3EE', bg: 'rgba(34,211,238,0.06)',   border: 'rgba(34,211,238,0.35)',  Icon: Zap,       label: 'Trigger'   },
  action:    { color: '#F59E0B', bg: 'rgba(245,158,11,0.06)',   border: 'rgba(245,158,11,0.35)',  Icon: Settings,  label: 'Action'    },
  data:      { color: '#818CF8', bg: 'rgba(129,140,248,0.06)',  border: 'rgba(129,140,248,0.35)', Icon: Database,  label: 'Data'      },
  transform: { color: '#10B981', bg: 'rgba(16,185,129,0.06)',   border: 'rgba(16,185,129,0.35)',  Icon: RefreshCw, label: 'Transform' },
  condition: { color: '#F472B6', bg: 'rgba(244,114,182,0.06)',  border: 'rgba(244,114,182,0.35)', Icon: GitBranch, label: 'Condition' },
  merge:     { color: '#A78BFA', bg: 'rgba(167,139,250,0.06)',  border: 'rgba(167,139,250,0.35)', Icon: Merge,     label: 'Merge'     },
}

const STATUS_RING: Record<string, string> = {
  running: 'shadow-[0_0_0_2px_#F59E0B] animate-pulse',
  success: 'shadow-[0_0_0_2px_#10B981]',
  failed:  'shadow-[0_0_0_2px_#EF4444]',
  skipped: 'shadow-[0_0_0_2px_#4B5563]',
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
  executionStatus?: 'running' | 'success' | 'failed' | 'skipped'
  [key: string]: unknown
}

function WorkflowNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as WorkflowNodeData
  const meta = NODE_TYPE_META[nodeData.moduleType] || NODE_TYPE_META.action
  const { Icon, color } = meta
  const execStatus = nodeData.executionStatus
  const isCondition = nodeData.moduleType === 'condition'
  const isTrigger = nodeData.moduleType === 'trigger'

  return (
    <div
      className="relative min-w-[200px] max-w-[240px] select-none"
    >
      {/* Visual Container with exact same box clipping for the line */}
      <div
        className={`absolute inset-0 rounded-xl overflow-hidden border transition-all duration-200
          ${STATUS_RING[execStatus || ''] || ''}
          ${selected
            ? 'shadow-[0_0_0_1px_rgba(255,255,255,0.15),0_8px_32px_rgba(0,0,0,0.6)]'
            : 'shadow-[0_4px_20px_rgba(0,0,0,0.5)]'}
        `}
        style={{
          background: meta.bg,
          borderColor: selected ? 'rgba(255,255,255,0.25)' : meta.border,
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* The line gets perfectly clipped to the box's exact rounded corners */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[4px]"
          style={{ background: color }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 pt-3 pb-2 pl-5">
          <Icon size={15} style={{ color, flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <div
              className="text-[11px] font-semibold uppercase tracking-wider mb-0.5"
              style={{ color }}
            >
              {meta.label}
            </div>
            <div className="text-[13px] font-medium text-white/90 truncate leading-tight">
              {nodeData.label}
            </div>
          </div>

          {/* Status indicator */}
          {execStatus && (
            <div className={`
              w-2 h-2 rounded-full flex-shrink-0
              ${execStatus === 'running'  ? 'bg-amber-400 animate-pulse' :
                execStatus === 'success'  ? 'bg-emerald-400' :
                execStatus === 'failed'   ? 'bg-red-400' :
                'bg-zinc-500'}
            `} />
          )}
        </div>

        {/* Category badge */}
        {nodeData.category && nodeData.category !== 'core' && (
          <div className="px-5 pb-2">
            <span
              className="inline-block text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ background: `${color}20`, color }}
            >
              {nodeData.category}
            </span>
          </div>
        )}
      </div>

      {/* Input handle – left center */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !border-2 !rounded-full transition-all"
          style={{
            background: '#1a1f2e',
            borderColor: meta.color,
            left: -7,
            zIndex: 20
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
            style={{ top: '35%', right: -7, background: '#10B981', borderColor: '#10B981', width: 12, height: 12, border: '2px solid #10B981', zIndex: 20 }}
          />
          <Handle
            id="false"
            type="source"
            position={Position.Right}
            style={{ top: '65%', right: -7, background: '#EF4444', borderColor: '#EF4444', width: 12, height: 12, border: '2px solid #EF4444', zIndex: 20 }}
          />
          <div
            className="absolute text-[9px] font-bold"
            style={{ right: -28, top: 'calc(35% - 6px)', color: '#10B981', zIndex: 20 }}
          >
            T
          </div>
          <div
            className="absolute text-[9px] font-bold"
            style={{ right: -26, top: 'calc(65% - 6px)', color: '#EF4444', zIndex: 20 }}
          >
            F
          </div>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !border-2 !rounded-full transition-all"
          style={{
            background: '#1a1f2e',
            borderColor: meta.color,
            right: -7,
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
