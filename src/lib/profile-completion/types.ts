export type IssueSeverity = 'blocker' | 'warning' | 'advisory';
export type IssueArea = 'parent' | 'child' | 'billing';

export type CompletionIssue = {
  code: string;
  label: string;
  severity: IssueSeverity;
  area: IssueArea;
  actionPath?: string;
  /** For child-specific issues, identifies which child */
  childId?: string;
  childName?: string;
};

export type CompletionSection = {
  complete: boolean;
  blockers: CompletionIssue[];
  warnings: CompletionIssue[];
  advisories: CompletionIssue[];
};

export type ProfileCompletion = {
  parent: CompletionSection;
  child: CompletionSection;
  billing: CompletionSection;
  hasBlockingIssues: boolean;
  hasBookingWarnings: boolean;
  hasAdvisories: boolean;
  completionPercent: number;
};
