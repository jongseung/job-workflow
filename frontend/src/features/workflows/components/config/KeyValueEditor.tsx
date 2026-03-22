import { Plus, Trash2 } from 'lucide-react'

interface KeyValueEditorProps {
  value: Record<string, string>
  onChange: (v: Record<string, string>) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
}

export function KeyValueEditor({
  value,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
}: KeyValueEditorProps) {
  const entries = Object.entries(value)

  const update = (idx: number, k: string, v: string) => {
    const next = [...entries]
    next[idx] = [k, v]
    onChange(Object.fromEntries(next.filter(([key]) => key !== '')))
  }

  const remove = (idx: number) => {
    const next = entries.filter((_, i) => i !== idx)
    onChange(Object.fromEntries(next))
  }

  const add = () => {
    onChange({ ...value, '': '' })
  }

  return (
    <div className="space-y-1.5">
      {entries.map(([k, v], idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <input
            type="text"
            value={k}
            onChange={(e) => update(idx, e.target.value, v)}
            placeholder={keyPlaceholder}
            className="flex-1 min-w-0 bg-bg-tertiary rounded-lg px-2.5 py-1 text-[11px] text-text-primary outline-none border border-border focus:border-primary/50 transition-colors font-mono"
          />
          <span className="text-text-muted text-[11px]">:</span>
          <input
            type="text"
            value={v}
            onChange={(e) => update(idx, k, e.target.value)}
            placeholder={valuePlaceholder}
            className="flex-1 min-w-0 bg-bg-tertiary rounded-lg px-2.5 py-1 text-[11px] text-text-primary outline-none border border-border focus:border-primary/50 transition-colors"
          />
          <button
            type="button"
            onClick={() => remove(idx)}
            className="w-6 h-6 flex items-center justify-center text-text-muted hover:text-danger hover:bg-danger/10 rounded transition-all flex-shrink-0"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-secondary transition-colors py-0.5"
      >
        <Plus className="w-3 h-3" />
        추가
      </button>
    </div>
  )
}
