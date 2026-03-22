/**
 * MappableInput – visual data-mapping UI
 *
 * Shows a token chip when a field is mapped to a previous node output.
 * Clicking the field opens a dropdown of all upstream node outputs.
 * Clicking an output field inserts it as a reference token.
 */
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, X } from 'lucide-react'
import type { InputMapping } from '../../../api/workflows'
import { NODE_TYPE_META } from './nodes/WorkflowNode'

export interface UpstreamOutput {
  nodeId: string
  nodeLabel: string
  moduleType: string
  fields: Array<{ path: string; type: string; example?: unknown }>
}

interface MappableInputProps {
  fieldName: string
  label: string
  value: InputMapping | string | number | null | undefined
  upstreamOutputs: UpstreamOutput[]
  onChange: (value: InputMapping | string | null) => void
  placeholder?: string
  type?: 'text' | 'number' | 'textarea'
}

export function MappableInput({
  fieldName,
  label,
  value,
  upstreamOutputs,
  onChange,
  placeholder,
  type = 'text',
}: MappableInputProps) {
  const [open, setOpen] = useState(false)
  const [staticValue, setStaticValue] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // Determine if current value is a node-output mapping
  const isMapped = value && typeof value === 'object' && (value as InputMapping).type === 'node_output'
  const mapped = isMapped ? (value as InputMapping) : null

  useEffect(() => {
    if (!isMapped && value !== null && value !== undefined) {
      setStaticValue(String(value))
    }
  }, [value, isMapped])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelectField = (nodeId: string, _nodeLabel: string, path: string) => {
    onChange({ type: 'node_output', nodeId, path })
    setOpen(false)
  }

  const handleClearMapping = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null)
    setStaticValue('')
  }

  const hasUpstream = upstreamOutputs.length > 0

  return (
    <div ref={ref} className="relative mb-3">
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
        {label}
      </label>

      {/* Input area */}
      <div
        className={`
          relative flex items-center rounded-lg border transition-all duration-150 cursor-text
          ${open ? 'border-primary/50 shadow-[0_0_0_2px_rgba(0,212,255,0.08)]' : 'border-border'}
          ${isMapped ? 'bg-primary/5' : 'bg-bg-tertiary'}
        `}
        onClick={() => {
          if (!isMapped) setOpen(true)
        }}
      >
        {isMapped ? (
          <MappedToken
            nodeId={mapped!.nodeId!}
            path={mapped!.path || ''}
            upstreamOutputs={upstreamOutputs}
            onClear={handleClearMapping}
            onReopen={() => setOpen(true)}
          />
        ) : (
          type === 'textarea' ? (
            <textarea
              value={staticValue}
              onChange={(e) => {
                setStaticValue(e.target.value)
                onChange(e.target.value)
              }}
              placeholder={placeholder || `${label}을 입력하거나 노드 출력을 선택하세요`}
              rows={3}
              className="w-full bg-transparent text-[12px] text-text-primary px-3 py-2 outline-none resize-none placeholder:text-text-muted"
            />
          ) : (
            <input
              type={type}
              value={staticValue}
              onChange={(e) => {
                setStaticValue(e.target.value)
                onChange(type === 'number' ? Number(e.target.value) as unknown as string : e.target.value)
              }}
              placeholder={placeholder || `${label}을 입력하거나 노드 출력을 선택하세요`}
              className="w-full bg-transparent text-[12px] text-text-primary px-3 py-1.5 outline-none placeholder:text-text-muted"
              onFocus={() => setOpen(hasUpstream)}
            />
          )
        )}

        {/* Arrow button to open mapping dropdown */}
        {hasUpstream && (
          <button
            type="button"
            className={`
              flex-shrink-0 w-8 h-full flex items-center justify-center
              transition-colors rounded-r-lg
              ${open ? 'text-primary' : 'text-text-muted hover:text-text-secondary'}
            `}
            style={{ minHeight: 32 }}
            onMouseDown={(e) => { e.preventDefault(); setOpen(!open) }}
            title="노드 출력에서 매핑"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && hasUpstream && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-border overflow-hidden shadow-2xl bg-bg-card">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-text-muted border-b border-border bg-bg-tertiary">
            이전 노드 출력에서 선택
          </div>
          {upstreamOutputs.map((upstream) => {
            const meta = NODE_TYPE_META[upstream.moduleType] || NODE_TYPE_META.action
            const { Icon } = meta
            return (
              <div key={upstream.nodeId}>
                <div
                  className="flex items-center gap-2 px-3 py-1.5"
                  style={{ background: `${meta.color}08` }}
                >
                  <Icon size={11} style={{ color: meta.color, flexShrink: 0 }} />
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: meta.color }}
                  >
                    {upstream.nodeLabel}
                  </span>
                </div>
                {upstream.fields.length > 0 ? (
                  upstream.fields.map((field) => (
                    <button
                      key={field.path}
                      type="button"
                      className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-bg-hover transition-colors group"
                      onClick={() => handleSelectField(upstream.nodeId, upstream.nodeLabel, field.path)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-mono text-text-primary">
                          {field.path}
                        </span>
                        <span
                          className="text-[10px] px-1 rounded"
                          style={{ background: `${meta.color}20`, color: meta.color }}
                        >
                          {field.type}
                        </span>
                      </div>
                      {field.example !== undefined && (
                        <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity truncate max-w-[80px] ml-2 text-text-muted font-mono">
                          {JSON.stringify(field.example)}
                        </span>
                      )}
                    </button>
                  ))
                ) : (
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-4 py-1.5 hover:bg-bg-hover transition-colors"
                    onClick={() => handleSelectField(upstream.nodeId, upstream.nodeLabel, 'result')}
                  >
                    <span className="text-[12px] font-mono text-text-primary">result</span>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MappedToken({
  nodeId,
  path,
  upstreamOutputs,
  onClear,
  onReopen,
}: {
  nodeId: string
  path: string
  upstreamOutputs: UpstreamOutput[]
  onClear: (e: React.MouseEvent) => void
  onReopen: () => void
}) {
  const upstream = upstreamOutputs.find((u) => u.nodeId === nodeId)
  const meta = NODE_TYPE_META[upstream?.moduleType || 'action'] || NODE_TYPE_META.action
  const { Icon } = meta

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer flex-1 min-w-0"
      onClick={onReopen}
    >
      <Icon size={11} style={{ color: meta.color, flexShrink: 0 }} />
      <span className="text-[12px] font-medium truncate" style={{ color: meta.color }}>
        {upstream?.nodeLabel || nodeId}
      </span>
      <span className="text-text-muted text-[11px] flex-shrink-0">→</span>
      <span className="text-[12px] font-mono text-text-primary truncate">
        {path}
      </span>
      <button
        type="button"
        className="ml-auto text-text-muted hover:text-text-secondary transition-colors w-4 h-4 flex items-center justify-center rounded flex-shrink-0"
        onClick={onClear}
        title="매핑 해제"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
