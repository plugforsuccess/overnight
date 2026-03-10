'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, Moon } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Sign-in succeeded but session was not established. Please try again.');
        setLoading(false);
        return;
      }

      const meRes = await fetch('/api/auth/me', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } });
      if (meRes.ok) {
        const { role } = await meRes.json();
        const redirectTo = searchParams.get('redirect');
        const destination = role === 'admin' ? '/admin' : (redirectTo || '/dashboard');
        router.replace(destination);
        router.refresh();
      } else {
        setError('Your account exists but no parent profile was found. Please contact support.');
        setLoading(false);
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-[85vh] max-w-6xl items-center gap-6 px-4 py-10 md:grid-cols-2">
      <div className="hidden rounded-3xl bg-slate-900 p-8 text-white md:block">
        <Moon className="h-8 w-8 text-sky-300" />
        <h1 className="mt-4 text-3xl font-semibold">Welcome back to your overnight care hub</h1>
        <p className="mt-3 text-slate-300">Track child activity, reservations, and safety updates in one trusted parent dashboard.</p>
        <p className="mt-6 inline-flex items-center gap-2 text-sm text-emerald-300"><ShieldCheck className="h-4 w-4" />Secure facility-first records and verified pickup flows.</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
        <p className="mt-1 text-sm text-slate-600">Access your parent or operations portal.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" placeholder="Email address" required />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field" placeholder="Password" required />
          <button type="submit" className="btn-primary w-full" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
        </form>
        <p className="mt-4 text-sm text-slate-600">Don&apos;t have an account? <Link href="/signup" className="font-semibold text-sky-700">Create one</Link></p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div className="min-h-[80vh]" />}><LoginForm /></Suspense>;
}
