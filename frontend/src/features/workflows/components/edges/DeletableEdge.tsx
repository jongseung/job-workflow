import { memo, useState } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react'
import { X } from 'lucide-react'

function DeletableEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
  selected,
}: EdgeProps) {
  const { setEdges } = useReactFlow()
  const [hovered, setHovered] = useState(false)

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const branch = (data as Record<string, unknown>)?.branch as string | null
  const strokeColor = branch === 'true'
    ? '#00C48C'
    : branch === 'false'
    ? '#EF4444'
    : (selected || hovered) ? '#00d4ff' : '#2a2a32'

  const onDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEdges((eds) => eds.filter((edge) => edge.id !== id))
  }

  return (
    <>
      {/* Invisible wider path for easier hover target */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: 'pointer' }}
      />
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth: (selected || hovered) ? 2.5 : 2,
          filter: selected ? 'drop-shadow(0 0 4px rgba(0, 212, 255, 0.3))' : undefined,
          transition: 'stroke 200ms, stroke-width 200ms',
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {(hovered || selected) && (
            <button
              type="button"
              onClick={onDelete}
              className="w-5 h-5 flex items-center justify-center rounded-full bg-[#1a1a1f] border border-[#2a2a32] text-[#5a5a65] hover:bg-danger hover:border-danger hover:text-white transition-all duration-150 shadow-lg shadow-black/40"
              title="연결 삭제"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

export const DeletableEdge = memo(DeletableEdgeComponent)
DeletableEdge.displayName = 'DeletableEdge'

export const edgeTypes = {
  deletable: DeletableEdge,
}
