# Add File Discard to Review Workflow

## Overview

Add per-file discard capability to the existing human review workflow in DiffViewDialog, allowing users to selectively exclude unwanted files (e.g., CSS changes) from task changes before merging/staging.

## Workflow Type

**Feature Enhancement** - Extending existing human review capabilities with selective file discard functionality.

## Task Scope

### Components Affected
- **DiffViewDialog**: Primary UI component requiring enhancement to add discard action per file

### Technical Approach
- Use `git restore <file>` to revert specific files in worktree
- File-level granularity (not hunk-level)
- Must preserve other uncommitted changes

### Key Constraints
- Must not disrupt existing merge/stage/reject workflows
- Should only affect worktree (no staging area or commit history changes)
- Need clear user confirmation/feedback for destructive action

## Success Criteria

1. Users can review task changes in DiffViewDialog
2. Users can identify unwanted file changes
3. Users can discard specific files individually via UI action
4. Users can proceed with merge/stage for remaining files
5. Git restore operation correctly reverts only the targeted file
6. Other uncommitted changes remain unaffected
