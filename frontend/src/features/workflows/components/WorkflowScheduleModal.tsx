/**
 * WorkflowScheduleModal
 *
 * Schedule panel for a workflow — supports Manual / Cron / Interval modes.
 * Opens as a slide-over panel from the WorkflowEditorPage toolbar.
 */
import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { workflowsApi, type WorkflowOut } from '../../../api/workflows'
import { useUIStore } from '../../../stores/uiStore'

interface Props {
  workflow: WorkflowOut
  onClose: () => void
}

// Common cron presets
const CRON_PRESETS = [
  { label: '매분',        value: '* * * * *'    },
  { label: '매시간',      value: '0 * * * *'    },
  { label: '매일 자정',   value: '0 0 * * *'    },
  { label: '매일 오전9시', value: '0 9 * * *'   },
  { label: '매주 월요일', value: '0 9 * * 1'    },
  { label: '매월 1일',   value: '0 0 1 * *'     },
]

// Interval presets in seconds
const INTERVAL_PRESETS = [
  { label: '30초',  value: 30     },
  { label: '1분',   value: 60     },
  { label: '5분',   value: 300    },
  { label: '15분',  value: 900    },
  { label: '30분',  value: 1800   },
  { label: '1시간', value: 3600   },
  { label: '6시간', value: 21600  },
  { label: '1일',   value: 86400  },
]

function formatNextRun(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const diff = d.getTime() - Date.now()
  if (diff < 0) return '방금 전'
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return `${secs}초 후`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}분 후`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}시간 후`
  return d.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function secondsToHuman(s: number): string {
  if (s < 60) return `${s}초`
  if (s < 3600) return `${Math.round(s / 60)}분`
  if (s < 86400) return `${Math.round(s / 3600)}시간`
  return `${Math.round(s / 86400)}일`
}

export function WorkflowScheduleModal({ workflow, onClose }: Props) {
  const qc = useQueryClient()
  const addNotification = useUIStore((s) => s.addNotification)

  const [scheduleType, setScheduleType] = useState<'manual' | 'cron' | 'interval'>(
    (workflow.schedule_type as 'manual' | 'cron' | 'interval') || 'manual'
  )
  const [cronExpr, setCronExpr] = useState(workflow.cron_expression || '0 9 * * *')
  const [intervalSecs, setIntervalSecs] = useState(workflow.interval_seconds || 3600)
  const [customInterval, setCustomInterval] = useState(false)
  const [isActive, setIsActive] = useState(workflow.is_active)

  // Fetch live next_run_at
  const { data: scheduleInfo, refetch: refetchSchedule } = useQuery({
    queryKey: ['workflow-schedule', workflow.id],
    queryFn: () => workflowsApi.getSchedule(workflow.id).then((r) => r.data),
    refetchInterval: scheduleType !== 'manual' ? 10000 : false,
  })

  const saveMut = useMutation({
    mutationFn: () =>
      workflowsApi.setSchedule(workflow.id, {
        schedule_type: scheduleType,
        cron_expression: scheduleType === 'cron' ? cronExpr : null,
        interval_seconds: scheduleType === 'interval' ? intervalSecs : null,
        is_active: isActive,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow', workflow.id] })
      qc.invalidateQueries({ queryKey: ['workflows'] })
      refetchSchedule()
      addNotification({ type: 'success', message: '스케줄이 저장되었습니다' })
    },
    onError: () => addNotification({ type: 'error', message: '스케줄 저장 실패' }),
  })

  const nextRun = scheduleInfo?.next_run_at || workflow.next_run_at

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-[480px] rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: '#0D1117' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b border-white/5"
          style={{ background: 'rgba(129,140,248,0.06)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
              style={{ background: 'rgba(129,140,248,0.15)', border: '1px solid rgba(129,140,248,0.3)' }}
            >
              ⏱
            </div>
            <div>
              <div
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: '#818CF8', fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                워크플로우 스케줄
              </div>
              <div
                className="text-[13px] font-semibold text-white/80"
                style={{ fontFamily: "'Barlow', sans-serif" }}
              >
                {workflow.name}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Schedule type selector */}
          <div>
            <Label>실행 유형</Label>
            <div className="flex gap-2 mt-2">
              {([
                { key: 'manual',   icon: '▶',  label: '수동',      desc: '직접 실행'        },
                { key: 'cron',     icon: '⏰', label: 'Cron',      desc: 'Cron 표현식'      },
                { key: 'interval', icon: '↻',  label: '인터벌',    desc: '주기적 반복'      },
              ] as const).map(({ key, icon, label, desc }) => {
                const isActive = scheduleType === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setScheduleType(key)}
                    className="flex-1 flex flex-col items-center gap-1 py-3 rounded-xl transition-all border"
                    style={{
                      background: isActive ? 'rgba(129,140,248,0.12)' : 'rgba(255,255,255,0.03)',
                      borderColor: isActive ? 'rgba(129,140,248,0.4)' : 'rgba(255,255,255,0.06)',
                    }}
                  >
                    <span className="text-lg">{icon}</span>
                    <span
                      className="text-[12px] font-semibold"
                      style={{ color: isActive ? '#818CF8' : '#848D97', fontFamily: "'Barlow', sans-serif" }}
                    >
                      {label}
                    </span>
                    <span
                      className="text-[10px]"
                      style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}
                    >
                      {desc}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Cron settings */}
          {scheduleType === 'cron' && (
            <div className="space-y-3">
              <Label>Cron 표현식</Label>
              <input
                type="text"
                value={cronExpr}
                onChange={(e) => setCronExpr(e.target.value)}
                placeholder="분 시 일 월 요일"
                className="w-full rounded-xl px-3 py-2.5 text-[13px] outline-none border border-white/8 focus:border-indigo-400/40 transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  color: '#E6EDF3',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              />
              {/* Presets */}
              <div>
                <span className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#484F58', fontFamily: "'Barlow Condensed', sans-serif" }}>
                  프리셋
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {CRON_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setCronExpr(p.value)}
                      className="px-2.5 py-1 rounded-lg text-[11px] transition-all border"
                      style={{
                        background: cronExpr === p.value ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.03)',
                        borderColor: cronExpr === p.value ? 'rgba(129,140,248,0.4)' : 'rgba(255,255,255,0.06)',
                        color: cronExpr === p.value ? '#818CF8' : '#848D97',
                        fontFamily: "'Barlow', sans-serif",
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="text-[13px]">💡</span>
                <div>
                  <p className="text-[10px]" style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}>
                    형식: <code style={{ color: '#818CF8', fontFamily: "'JetBrains Mono', monospace" }}>분(0-59) 시(0-23) 일(1-31) 월(1-12) 요일(0-7)</code>
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}>
                    현재: <code style={{ color: '#22D3EE', fontFamily: "'JetBrains Mono', monospace" }}>{cronExpr}</code>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Interval settings */}
          {scheduleType === 'interval' && (
            <div className="space-y-3">
              <Label>실행 주기</Label>
              {/* Preset buttons */}
              <div className="grid grid-cols-4 gap-1.5">
                {INTERVAL_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => { setIntervalSecs(p.value); setCustomInterval(false) }}
                    className="py-2 rounded-xl text-[11px] font-medium transition-all border"
                    style={{
                      background: !customInterval && intervalSecs === p.value ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.03)',
                      borderColor: !customInterval && intervalSecs === p.value ? 'rgba(129,140,248,0.4)' : 'rgba(255,255,255,0.06)',
                      color: !customInterval && intervalSecs === p.value ? '#818CF8' : '#848D97',
                      fontFamily: "'Barlow', sans-serif",
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {/* Custom input */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCustomInterval(!customInterval)}
                  className="px-3 py-1.5 rounded-lg text-[11px] transition-all border"
                  style={{
                    background: customInterval ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.03)',
                    borderColor: customInterval ? 'rgba(129,140,248,0.4)' : 'rgba(255,255,255,0.06)',
                    color: customInterval ? '#818CF8' : '#484F58',
                    fontFamily: "'Barlow', sans-serif",
                  }}
                >
                  직접 입력
                </button>
                {customInterval && (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="number"
                      value={intervalSecs}
                      onChange={(e) => setIntervalSecs(Math.max(10, Number(e.target.value)))}
                      min={10}
                      className="flex-1 rounded-lg px-3 py-1.5 text-[12px] outline-none border border-white/8 focus:border-indigo-400/40 transition-colors"
                      style={{ background: 'rgba(255,255,255,0.04)', color: '#E6EDF3', fontFamily: "'JetBrains Mono', monospace" }}
                    />
                    <span className="text-[11px]" style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}>초</span>
                  </div>
                )}
              </div>
              <p className="text-[11px]" style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}>
                선택된 주기: <span style={{ color: '#818CF8' }}>{secondsToHuman(intervalSecs)}</span>마다 실행
              </p>
            </div>
          )}

          {/* Active toggle */}
          <div className="flex items-center justify-between py-3 px-4 rounded-xl border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div>
              <div className="text-[12px] font-semibold text-white/70" style={{ fontFamily: "'Barlow', sans-serif" }}>
                스케줄 활성화
              </div>
              <div className="text-[10px]" style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}>
                {scheduleType === 'manual' ? '수동 모드에서는 영향 없음' : isActive ? '스케줄이 실행됩니다' : '스케줄이 일시 중지됩니다'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className="relative w-11 h-6 rounded-full transition-all flex-shrink-0"
              style={{
                background: isActive ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.1)',
                border: isActive ? '1px solid rgba(16,185,129,0.6)' : '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full transition-all duration-200 shadow"
                style={{
                  background: isActive ? '#10B981' : '#484F58',
                  left: isActive ? 'calc(100% - 22px)' : '2px',
                  boxShadow: isActive ? '0 0 8px rgba(16,185,129,0.5)' : 'none',
                }}
              />
            </button>
          </div>

          {/* Next run display */}
          {scheduleType !== 'manual' && (
            <div
              className="flex items-center gap-3 py-3 px-4 rounded-xl border"
              style={{
                background: 'rgba(129,140,248,0.05)',
                borderColor: 'rgba(129,140,248,0.15)',
              }}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-base" style={{ background: 'rgba(129,140,248,0.12)' }}>
                ⏱
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: '#484F58', fontFamily: "'Barlow Condensed', sans-serif" }}>
                  다음 실행
                </div>
                <div className="text-[13px] font-semibold" style={{ color: '#818CF8', fontFamily: "'Barlow', sans-serif" }}>
                  {nextRun ? formatNextRun(nextRun) : '저장 후 표시됩니다'}
                </div>
                {nextRun && (
                  <div className="text-[10px] mt-0.5 font-mono" style={{ color: '#484F58', fontFamily: "'JetBrains Mono', monospace" }}>
                    {new Date(nextRun).toLocaleString('ko-KR')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-9 rounded-xl text-[12px] transition-all border border-white/10 text-white/40 hover:bg-white/5"
            style={{ fontFamily: "'Barlow', sans-serif" }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="flex-1 h-9 rounded-xl text-[12px] font-semibold transition-all disabled:opacity-50"
            style={{
              background: 'rgba(129,140,248,0.2)',
              border: '1px solid rgba(129,140,248,0.4)',
              color: '#818CF8',
              fontFamily: "'Barlow', sans-serif",
            }}
          >
            {saveMut.isPending ? '저장 중...' : '스케줄 저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-[10px] font-bold uppercase tracking-widest"
      style={{ color: '#484F58', fontFamily: "'Barlow Condensed', sans-serif" }}
    >
      {children}
    </label>
  )
}
