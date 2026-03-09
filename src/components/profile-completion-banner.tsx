'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, Shield, Info, X, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import type { ProfileCompletion, CompletionIssue } from '@/lib/profile-completion/types';

/**
 * Sticky profile completion banner for the dashboard.
 * Shows Tier 1 blockers (red), Tier 2 warnings (amber), and Tier 3 advisories (neutral).
 * Only renders when there are issues to display.
 */
export function ProfileCompletionBanner() {
  const [completion, setCompletion] = useState<ProfileCompletion | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch('/api/profile-completion', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (res.ok) {
          const data: ProfileCompletion = await res.json();
          setCompletion(data);
        }
      } catch {
        // Silently fail — banner is non-critical
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading || !completion || dismissed) return null;

  // Don't show if no issues at all
  const allIssues = [
    ...completion.parent.blockers,
    ...completion.parent.warnings,
    ...completion.child.blockers,
    ...completion.child.warnings,
    ...completion.billing.blockers,
    ...completion.billing.warnings,
    // Advisories shown separately, not in main banner
  ];

  if (allIssues.length === 0) return null;

  const hasBlockers = completion.hasBlockingIssues;

  return (
    <div
      className={`rounded-lg border-l-4 p-4 mb-6 ${
        hasBlockers
          ? 'bg-red-50 border-l-red-500'
          : 'bg-amber-50 border-l-amber-500'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          {hasBlockers ? (
            <Shield className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <h3 className={`font-semibold text-sm ${hasBlockers ? 'text-red-900' : 'text-amber-900'}`}>
              {hasBlockers ? 'Action Required' : 'Complete Your Profile'}
            </h3>
            <p className={`text-sm mt-0.5 ${hasBlockers ? 'text-red-700' : 'text-amber-700'}`}>
              {hasBlockers
                ? 'Required items must be completed before you can book care.'
                : 'Finishing these items will improve your experience.'}
            </p>
            <ul className="mt-2 space-y-1">
              {allIssues.slice(0, 3).map((issue) => (
                <BannerIssueItem key={issue.code + (issue.childId || '')} issue={issue} />
              ))}
              {allIssues.length > 3 && (
                <li className="text-sm">
                  <Link
                    href="/dashboard/complete-profile"
                    className={`font-medium hover:underline ${hasBlockers ? 'text-red-700' : 'text-amber-700'}`}
                  >
                    +{allIssues.length - 3} more item{allIssues.length - 3 > 1 ? 's' : ''} to complete
                  </Link>
                </li>
              )}
            </ul>
            {hasBlockers && (
              <Link
                href="/dashboard/complete-profile"
                className="inline-flex items-center gap-1 mt-3 text-sm font-semibold text-red-700 hover:text-red-800"
              >
                Complete profile <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>

        {!hasBlockers && (
          <button
            onClick={() => setDismissed(true)}
            className="text-amber-400 hover:text-amber-600 flex-shrink-0"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function BannerIssueItem({ issue }: { issue: CompletionIssue }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          issue.severity === 'blocker' ? 'bg-red-500' : 'bg-amber-500'
        }`}
      />
      {issue.actionPath ? (
        <Link
          href={issue.actionPath}
          className={`hover:underline ${
            issue.severity === 'blocker' ? 'text-red-800' : 'text-amber-800'
          }`}
        >
          {issue.label}
        </Link>
      ) : (
        <span className={issue.severity === 'blocker' ? 'text-red-800' : 'text-amber-800'}>
          {issue.label}
        </span>
      )}
    </li>
  );
}
