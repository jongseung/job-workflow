import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Play, CheckCircle, XCircle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { workflowsApi } from '../../../../api/workflows'
import type { WorkflowNodeData } from '../nodes/WorkflowNode'

interface NodeTestPanelProps {
  workflowId: string
  nodeId: string
  nodeData: WorkflowNodeData
}

export function NodeTestPanel({ workflowId, nodeId, nodeData }: NodeTestPanelProps) {
  const [showResult, setShowResult] = useState(true)
  const [mockInput, setMockInput] = useState('{}')
  const [mockError, setMockError] = useState<string | null>(null)

  const testMut = useMutation({
    mutationFn: () => {
      let input: Record<string, unknown> = {}
      try {
        input = JSON.parse(mockInput)
      } catch {
        // use empty
      }
      return workflowsApi
        .testNode(workflowId, nodeId, {
          node_data: nodeData as unknown as Record<string, unknown>,
          input_data: input,
        })
        .then((r) => r.data)
    },
  })

  const validateMock = (v: string) => {
    setMockInput(v)
    try {
      JSON.parse(v)
      setMockError(null)
    } catch {
      setMockError('유효하지 않은 JSON')
    }
  }

  return (
    <div className="border-t border-border pt-4 mt-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2.5 flex items-center gap-1.5">
        <Play className="w-3 h-3" />
        노드 테스트
      </div>

      {/* Mock input */}
      <div className="mb-2.5">
        <label className="block text-[10px] uppercase tracking-widest text-text-muted mb-1">
          목 입력 데이터 (JSON)
        </label>
        <textarea
          value={mockInput}
          onChange={(e) => validateMock(e.target.value)}
          rows={3}
          className={`w-full bg-bg-tertiary rounded-lg px-3 py-2 text-[11px] font-mono text-text-primary outline-none border transition-colors resize-none ${
            mockError ? 'border-danger/50' : 'border-border focus:border-primary/50'
          }`}
          placeholder='{"key": "value"}'
        />
        {mockError && (
          <p className="mt-0.5 text-[10px] text-danger">{mockError}</p>
        )}
      </div>

      {/* Run button */}
      <button
        type="button"
        disabled={testMut.isPending || !!mockError}
        onClick={() => {
          setShowResult(true)
          testMut.mutate()
        }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-primary/8 text-primary border border-primary/30 hover:bg-primary/15 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {testMut.isPending ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Play className="w-3 h-3" />
        )}
        {testMut.isPending ? '실행 중...' : '테스트 실행'}
      </button>

      {/* Result */}
      {testMut.data && showResult && (
        <div className="mt-2.5">
          <button
            type="button"
            onClick={() => setShowResult((v) => !v)}
            className="flex items-center gap-1.5 mb-1.5 text-[10px] uppercase tracking-widest text-text-muted hover:text-text-secondary transition-colors"
          >
            {showResult ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            결과
          </button>

          <div
            className={`rounded-lg p-2.5 border text-[11px] ${
              testMut.data.status === 'success'
                ? 'bg-success/5 border-success/20'
                : 'bg-danger/5 border-danger/20'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              {testMut.data.status === 'success' ? (
                <CheckCircle className="w-3.5 h-3.5 text-success flex-shrink-0" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-danger flex-shrink-0" />
              )}
              <span
                className={`font-semibold uppercase tracking-wider text-[10px] ${
                  testMut.data.status === 'success' ? 'text-success' : 'text-danger'
                }`}
              >
                {testMut.data.status === 'success' ? '성공' : '실패'}
              </span>
            </div>

            {testMut.data.status === 'error' && testMut.data.error && (
              <pre className="text-danger font-mono text-[10px] whitespace-pre-wrap">
                {testMut.data.error}
              </pre>
            )}

            {testMut.data.status === 'success' && testMut.data.output && (
              <pre className="text-text-secondary font-mono text-[10px] whitespace-pre-wrap overflow-x-auto max-h-32">
                {JSON.stringify(testMut.data.output, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
