/**
 * WorkflowScheduleModal
 * Schedule panel for a workflow — supports Manual / Cron / Interval modes.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Clock, Play, Calendar, RefreshCw, Info } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { workflowsApi, type WorkflowOut } from '../../../api/workflows'
import { useUIStore } from '../../../stores/uiStore'

interface Props {
  workflow: WorkflowOut
  onClose: () => void
}

const CRON_PRESETS = [
  { label: '매분',        value: '* * * * *'    },
  { label: '매시간',      value: '0 * * * *'    },
  { label: '매일 자정',   value: '0 0 * * *'    },
  { label: '매일 오전9시', value: '0 9 * * *'   },
  { label: '매주 월요일', value: '0 9 * * 1'    },
  { label: '매월 1일',   value: '0 0 1 * *'     },
]

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

  const SCHEDULE_TYPES = [
    { key: 'manual' as const,   Icon: Play,       label: '수동',    desc: '직접 실행'   },
    { key: 'cron' as const,     Icon: Calendar,   label: 'Cron',    desc: 'Cron 표현식' },
    { key: 'interval' as const, Icon: RefreshCw,  label: '인터벌',  desc: '주기적 반복' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[480px] bg-bg-card border border-border rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-text-muted">
                워크플로우 스케줄
              </div>
              <div className="text-sm font-semibold text-text-primary">
                {workflow.name}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Schedule type selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-2">
              실행 유형
            </label>
            <div className="flex gap-2">
              {SCHEDULE_TYPES.map(({ key, Icon, label, desc }) => {
                const active = scheduleType === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setScheduleType(key)}
                    className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-all ${
                      active
                        ? 'bg-primary/8 border-primary/30 text-primary'
                        : 'bg-bg-tertiary border-border text-text-muted hover:border-border hover:text-text-secondary'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[12px] font-semibold">{label}</span>
                    <span className="text-[10px] text-text-muted">{desc}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Cron settings */}
          {scheduleType === 'cron' && (
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-text-muted">
                Cron 표현식
              </label>
              <Input
                type="text"
                value={cronExpr}
                onChange={(e) => setCronExpr(e.target.value)}
                placeholder="분 시 일 월 요일"
                className="font-mono"
              />
              {/* Presets */}
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-text-muted mb-1.5">
                  프리셋
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {CRON_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setCronExpr(p.value)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] border transition-all ${
                        cronExpr === p.value
                          ? 'bg-primary/8 border-primary/30 text-primary'
                          : 'bg-bg-tertiary border-border text-text-muted hover:text-text-secondary'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-xl bg-bg-tertiary border border-border">
                <Info className="w-3.5 h-3.5 text-text-muted mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-text-muted">
                    형식: <code className="font-mono text-primary">분(0-59) 시(0-23) 일(1-31) 월(1-12) 요일(0-7)</code>
                  </p>
                  <p className="text-[10px] text-text-muted mt-0.5">
                    현재: <code className="font-mono text-info">{cronExpr}</code>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Interval settings */}
          {scheduleType === 'interval' && (
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-text-muted">
                실행 주기
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {INTERVAL_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => { setIntervalSecs(p.value); setCustomInterval(false) }}
                    className={`py-2 rounded-xl text-[11px] font-medium border transition-all ${
                      !customInterval && intervalSecs === p.value
                        ? 'bg-primary/8 border-primary/30 text-primary'
                        : 'bg-bg-tertiary border-border text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCustomInterval(!customInterval)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] border transition-all ${
                    customInterval
                      ? 'bg-primary/8 border-primary/30 text-primary'
                      : 'bg-bg-tertiary border-border text-text-muted hover:text-text-secondary'
                  }`}
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
                      className="flex-1 bg-bg-tertiary rounded-lg px-3 py-1.5 text-[12px] text-text-primary outline-none border border-border focus:border-primary/50 transition-colors font-mono"
                    />
                    <span className="text-[11px] text-text-muted">초</span>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-text-muted">
                선택된 주기: <span className="text-primary">{secondsToHuman(intervalSecs)}</span>마다 실행
              </p>
            </div>
          )}

          {/* Active toggle */}
          <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-bg-tertiary border border-border">
            <div>
              <div className="text-sm font-semibold text-text-secondary">스케줄 활성화</div>
              <div className="text-xs text-text-muted mt-0.5">
                {scheduleType === 'manual'
                  ? '수동 모드에서는 영향 없음'
                  : isActive ? '스케줄이 실행됩니다' : '스케줄이 일시 중지됩니다'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className="relative w-11 h-6 rounded-full transition-all flex-shrink-0"
              style={{
                background: isActive ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.08)',
                border: isActive ? '1px solid rgba(16,185,129,0.6)' : '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full transition-all duration-200"
                style={{
                  background: isActive ? '#10B981' : '#6B7280',
                  left: isActive ? 'calc(100% - 22px)' : '2px',
                }}
              />
            </button>
          </div>

          {/* Next run display */}
          {scheduleType !== 'manual' && (
            <div className="flex items-center gap-3 py-3 px-4 rounded-xl bg-primary/5 border border-primary/15">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">
                  다음 실행
                </div>
                <div className="text-sm font-semibold text-primary">
                  {nextRun ? formatNextRun(nextRun) : '저장 후 표시됩니다'}
                </div>
                {nextRun && (
                  <div className="text-[10px] text-text-muted mt-0.5 font-mono">
                    {new Date(nextRun).toLocaleString('ko-KR')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 pb-5">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            취소
          </Button>
          <Button
            className="flex-1"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
          >
            {saveMut.isPending ? '저장 중...' : '스케줄 저장'}
          </Button>
        </div>
      </div>
    </div>
  )
}
