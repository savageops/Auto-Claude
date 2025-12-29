import React from 'react';

/**
 * Skeleton placeholder for WorkspaceStatus component while merge preview is loading.
 * Matches the structure of the "Build Ready for Review" card.
 */
export function WorkspaceStatusSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header skeleton */}
      <div className="px-4 py-3 bg-muted/30 border-b border-border animate-pulse">
        <div className="flex items-center justify-between mb-3">
          <div className="h-5 w-40 bg-muted rounded" />  {/* "Build Ready for Review" */}
          <div className="h-7 w-16 bg-muted rounded" />  {/* View button */}
        </div>
        {/* Stats skeleton */}
        <div className="flex items-center gap-4">
          <div className="h-4 w-16 bg-muted rounded" />
          <div className="h-4 w-20 bg-muted rounded" />
          <div className="h-4 w-12 bg-muted rounded" />
          <div className="h-4 w-12 bg-muted rounded" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="px-4 py-3 space-y-3">
        <div className="h-10 bg-muted/30 rounded-lg animate-pulse" />
        <div className="h-8 bg-muted/30 rounded-lg animate-pulse" />
      </div>
    </div>
  );
}

/**
 * Skeleton placeholder for uncommitted changes warning while loading.
 * Matches the structure of the uncommitted changes alert.
 */
export function UncommittedChangesSkeleton() {
  return (
    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-warning/10 border border-warning/20 animate-pulse">
      <div className="h-4 w-4 bg-warning/40 rounded mt-0.5" />  {/* Icon placeholder */}
      <div className="flex-1 space-y-2">
        <div className="h-4 w-48 bg-warning/30 rounded" />  {/* Title */}
        <div className="h-3 w-64 bg-warning/20 rounded" />  {/* Subtitle */}
      </div>
    </div>
  );
}
