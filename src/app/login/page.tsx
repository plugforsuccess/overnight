'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Moon } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';

export default function LoginPage() {
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
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        console.log(`[login] signInWithPassword failed: ${authError.message}`);
        setError(authError.message);
        setLoading(false);
        return;
      }

      // Resolve parent profile server-side (bypasses RLS)
      const { data: { session } } = await supabase.auth.getSession();
      console.log(`[login] session after sign-in: exists=${!!session} userId=${session?.user?.id ?? 'null'}`);

      if (!session) {
        setError('Sign-in succeeded but session was not established. Please try again.');
        setLoading(false);
        return;
      }

      const meRes = await fetch('/api/auth/me', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      console.log(`[login] /api/auth/me response: status=${meRes.status}`);

      if (meRes.ok) {
        const { role } = await meRes.json();
        const redirectTo = searchParams.get('redirect');
        // Any center membership role (owner, admin, manager, staff, billing_only, viewer) → admin panel
        const isAdminPanelRole = role !== 'parent';
        const destination = isAdminPanelRole ? '/admin' : (redirectTo || '/dashboard');

        // Use router.replace (not push) so back button doesn't return to login
        // Then router.refresh() to ensure server components re-evaluate auth
        router.replace(destination);
        router.refresh();
      } else {
        const body = await meRes.text();
        console.error(`[login] /api/auth/me error: ${body}`);
        setError('Your account exists but no parent profile was found. Please contact support.');
        setLoading(false);
        return;
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Moon className="h-12 w-12 text-accent-500 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900">Welcome Back</h1>
          <p className="text-gray-600 mt-2">Sign in to your DreamWatch account</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                required
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          <div className="mt-4 text-center text-sm text-gray-600">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-accent-600 hover:text-accent-700 font-medium">
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
