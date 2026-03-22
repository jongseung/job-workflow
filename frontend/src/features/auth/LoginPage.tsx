import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { login, getMe } from '@/api/auth';
import { useAuthStore } from '@/stores/authStore';
import { Button, Input, FormField } from '@/components/ui';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const loginStore = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const tokens = await login(username, password);
      const user = await getMe(tokens.access_token);
      loginStore(tokens.access_token, tokens.refresh_token, user);
      navigate('/');
    } catch {
      setError('잘못된 사용자명 또는 비밀번호입니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        {/* Radial gradient spotlight */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[radial-gradient(circle,rgba(0,212,255,0.06)_0%,transparent_70%)]" />
        {/* Top-left accent glow */}
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(0,212,255,0.04)_0%,transparent_60%)]" />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="w-full max-w-[420px] relative animate-fade-in-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-12">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5 shadow-[0_0_40px_rgba(0,212,255,0.12)] animate-float">
            <Zap className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-extrabold text-text-primary tracking-tight">JobScheduler</h1>
          <p className="text-sm text-text-muted mt-2 tracking-wide">자동화된 작업 오케스트레이션</p>
        </div>

        {/* Login Card */}
        <div className="bg-bg-card/60 backdrop-blur-2xl border border-border/60 rounded-3xl p-10 shadow-2xl shadow-black/40 relative overflow-hidden">
          {/* Subtle top glow line */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

          <h2 className="text-lg font-bold text-text-primary mb-8 text-center tracking-tight">로그인하여 계속하기</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <FormField label="사용자명">
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                required
              />
            </FormField>
            <FormField label="비밀번호">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호 입력"
                required
              />
            </FormField>

            {error && (
              <p className="text-sm text-danger bg-danger/8 border border-danger/15 px-4 py-3 rounded-xl font-medium">{error}</p>
            )}

            <Button type="submit" disabled={loading} fullWidth size="lg">
              {loading ? '로그인 중...' : '로그인'}
            </Button>
          </form>

          <p className="mt-8 text-[11px] text-text-muted text-center tracking-wide">
            기본 로그인 정보: <span className="text-text-secondary font-semibold">admin / admin123</span>
          </p>
        </div>
      </div>
    </div>
  );
}
