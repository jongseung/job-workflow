import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'

export const NODE_TYPE_META: Record<string, {
  color: string
  bg: string
  border: string
  icon: string
  label: string
}> = {
  trigger:   { color: '#22D3EE', bg: 'rgba(34,211,238,0.06)',   border: 'rgba(34,211,238,0.35)',  icon: '⚡', label: 'Trigger'   },
  action:    { color: '#F59E0B', bg: 'rgba(245,158,11,0.06)',   border: 'rgba(245,158,11,0.35)',  icon: '⚙', label: 'Action'    },
  data:      { color: '#818CF8', bg: 'rgba(129,140,248,0.06)',  border: 'rgba(129,140,248,0.35)', icon: '🗃', label: 'Data'      },
  transform: { color: '#10B981', bg: 'rgba(16,185,129,0.06)',   border: 'rgba(16,185,129,0.35)',  icon: '⟳', label: 'Transform' },
  condition: { color: '#F472B6', bg: 'rgba(244,114,182,0.06)',  border: 'rgba(244,114,182,0.35)', icon: '◇', label: 'Condition' },
  merge:     { color: '#A78BFA', bg: 'rgba(167,139,250,0.06)',  border: 'rgba(167,139,250,0.35)', icon: '⊕', label: 'Merge'     },
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
  const icon = nodeData.icon || meta.icon
  const color = nodeData.color || meta.color
  const execStatus = nodeData.executionStatus
  const isCondition = nodeData.moduleType === 'condition'
  const isTrigger = nodeData.moduleType === 'trigger'

  return (
    <div
      className={`
        relative min-w-[200px] max-w-[240px] rounded-xl overflow-visible
        border transition-all duration-200 select-none
        ${STATUS_RING[execStatus || ''] || ''}
        ${selected
          ? 'border-white/30 shadow-[0_0_0_1px_rgba(255,255,255,0.15),0_8px_32px_rgba(0,0,0,0.6)]'
          : 'shadow-[0_4px_20px_rgba(0,0,0,0.5)]'}
      `}
      style={{
        background: meta.bg,
        borderColor: selected ? 'rgba(255,255,255,0.25)' : meta.border,
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Colored accent bar on left */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
        style={{ background: color }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 pl-5">
        <span className="text-base leading-none select-none" role="img">{icon}</span>
        <div className="flex-1 min-w-0">
          <div
            className="text-[11px] font-semibold uppercase tracking-wider mb-0.5"
            style={{ color, fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            {meta.label}
          </div>
          <div
            className="text-[13px] font-medium text-white/90 truncate leading-tight"
            style={{ fontFamily: "'Barlow', sans-serif" }}
          >
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
            style={{
              background: `${color}20`,
              color,
              fontFamily: "'Barlow', sans-serif",
            }}
          >
            {nodeData.category}
          </span>
        </div>
      )}

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
            style={{ top: '35%', right: -7, background: '#10B981', borderColor: '#10B981', width: 12, height: 12, border: '2px solid #10B981' }}
          />
          <Handle
            id="false"
            type="source"
            position={Position.Right}
            style={{ top: '65%', right: -7, background: '#EF4444', borderColor: '#EF4444', width: 12, height: 12, border: '2px solid #EF4444' }}
          />
          {/* Labels */}
          <div
            className="absolute text-[9px] font-bold"
            style={{ right: -28, top: 'calc(35% - 6px)', color: '#10B981', fontFamily: "'Barlow', sans-serif" }}
          >
            T
          </div>
          <div
            className="absolute text-[9px] font-bold"
            style={{ right: -26, top: 'calc(65% - 6px)', color: '#EF4444', fontFamily: "'Barlow', sans-serif" }}
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

// Register all node types mapping to WorkflowNode
export const nodeTypes = {
  workflowNode: WorkflowNode,
  triggerNode: WorkflowNode,
  actionNode: WorkflowNode,
  dataNode: WorkflowNode,
  transformNode: WorkflowNode,
  conditionNode: WorkflowNode,
  mergeNode: WorkflowNode,
}
