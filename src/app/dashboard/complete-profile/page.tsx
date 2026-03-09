'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Shield, AlertCircle, Check, CircleDot, LogOut, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import type { ProfileCompletion, CompletionIssue } from '@/lib/profile-completion/types';

/**
 * Full-screen profile completion gate.
 * Shown when Tier 1 blockers exist — prevents access to normal dashboard.
 */
export default function CompleteProfilePage() {
  const router = useRouter();
  const [completion, setCompletion] = useState<ProfileCompletion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setError('Session expired. Please log in again.');
          setLoading(false);
          return;
        }

        const res = await fetch('/api/profile-completion', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (!res.ok) throw new Error('Failed to load profile completion');

        const data: ProfileCompletion = await res.json();
        setCompletion(data);

        // If no blockers, redirect to dashboard
        if (!data.hasBlockingIssues) {
          router.replace('/dashboard');
          return;
        }

        setLoading(false);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    }

    load();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-red-50 text-red-700 px-6 py-4 rounded-lg flex items-start gap-3 max-w-md">
          <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Error</p>
            <p className="text-sm mt-1">{error}</p>
            <Link href="/login" className="text-sm font-medium underline mt-2 block">
              Return to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!completion) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-red-600" />
            <span className="font-semibold text-gray-900">Profile Setup Required</span>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <Shield className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            Complete your profile before booking or managing care
          </h1>
          <p className="text-gray-500 max-w-lg mx-auto">
            To keep children safe and billing accurate, please finish the required items below.
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium text-gray-700">Overall progress</span>
            <span className="font-semibold text-gray-900">{completion.completionPercent}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-red-500 h-3 rounded-full transition-all duration-500"
              style={{ width: `${completion.completionPercent}%` }}
            />
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-6">
          <CompletionSectionCard
            title="Parent Profile"
            section={completion.parent}
            icon="parent"
          />
          <CompletionSectionCard
            title="Child Safety Profile"
            section={completion.child}
            icon="child"
          />
          <CompletionSectionCard
            title="Billing Setup"
            section={completion.billing}
            icon="billing"
          />
        </div>
      </div>
    </div>
  );
}

function CompletionSectionCard({
  title,
  section,
  icon,
}: {
  title: string;
  section: ProfileCompletion['parent'];
  icon: 'parent' | 'child' | 'billing';
}) {
  const allItems = [...section.blockers, ...section.warnings, ...section.advisories];
  const hasBlockers = section.blockers.length > 0;
  const isComplete = section.complete && section.blockers.length === 0;

  return (
    <div
      className={`rounded-xl border-2 p-5 ${
        isComplete
          ? 'border-green-200 bg-green-50'
          : hasBlockers
            ? 'border-red-200 bg-white'
            : 'border-amber-200 bg-white'
      }`}
    >
      <div className="flex items-center gap-3 mb-4">
        {isComplete ? (
          <div className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center">
            <Check className="h-5 w-5 text-white" />
          </div>
        ) : (
          <div
            className={`h-8 w-8 rounded-full flex items-center justify-center ${
              hasBlockers ? 'bg-red-100' : 'bg-amber-100'
            }`}
          >
            <CircleDot
              className={`h-5 w-5 ${hasBlockers ? 'text-red-600' : 'text-amber-600'}`}
            />
          </div>
        )}
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {isComplete && (
            <p className="text-sm text-green-700">Complete</p>
          )}
          {hasBlockers && (
            <p className="text-sm text-red-600 font-medium">
              {section.blockers.length} required item{section.blockers.length !== 1 ? 's' : ''} remaining
            </p>
          )}
        </div>
      </div>

      {allItems.length > 0 && (
        <ul className="space-y-2">
          {allItems.map((item) => (
            <CompletionItem key={item.code + (item.childId || '')} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CompletionItem({ item }: { item: CompletionIssue }) {
  const severityStyles = {
    blocker: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    advisory: 'bg-gray-50 border-gray-200 text-gray-600',
  };

  const badgeStyles = {
    blocker: 'bg-red-100 text-red-700',
    warning: 'bg-amber-100 text-amber-700',
    advisory: 'bg-gray-100 text-gray-500',
  };

  const badgeLabel = {
    blocker: 'Required',
    warning: 'Recommended',
    advisory: 'Optional',
  };

  return (
    <li
      className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border ${severityStyles[item.severity]}`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span
          className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${badgeStyles[item.severity]}`}
        >
          {badgeLabel[item.severity]}
        </span>
        <span className="text-sm truncate">{item.label}</span>
      </div>
      {item.actionPath && (
        <Link
          href={item.actionPath}
          className="flex-shrink-0 text-sm font-medium hover:underline flex items-center gap-1"
        >
          Fix <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </li>
  );
}
