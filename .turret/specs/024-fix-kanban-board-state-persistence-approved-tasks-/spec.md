# Quick Spec: Fix Kanban Board State Persistence for Approved Tasks

## Task
Add persistence logic to TASK_REVIEW handler so approved tasks stay 'done' after window changes.

## Files to Modify
- `apps/frontend/src/main/ipc-handlers/task/execution-handlers.ts` (lines 228-243) - Add status persistence after QA approval

## Root Cause
The TASK_REVIEW handler (line 228-243) writes QA approval to file and sends TASK_STATUS_CHANGE event, but does NOT persist `status: 'done'` to `implementation_plan.json`. When tasks reload from disk, status is recalculated and reverts to 'human_review'.

## Change Details
After writing the QA report (line 234), add the same persistence logic used in TASK_UPDATE_STATUS handler (line 391-432):

1. Read `implementation_plan.json` from spec directory
2. Set `plan.status = 'done'`
3. Set `plan.planStatus = 'completed'`
4. Set `plan.updated_at = new Date().toISOString()`
5. Write file back with JSON.stringify(plan, null, 2)
6. Wrap in try-catch with console.error logging

## Pattern Reference
Copy the pattern from TASK_UPDATE_STATUS handler (lines 391-432):
```typescript
const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);
try {
  if (existsSync(planPath)) {
    const planContent = readFileSync(planPath, 'utf-8');
    const plan = JSON.parse(planContent);
    plan.status = 'done';
    plan.planStatus = 'completed';
    plan.updated_at = new Date().toISOString();
    writeFileSync(planPath, JSON.stringify(plan, null, 2));
  }
} catch (error) {
  console.error('[TASK_REVIEW] Failed to update implementation plan:', error);
}
```

## Verification
- [ ] Approve a task in human review
- [ ] Refresh window or trigger a task store update
- [ ] Task should remain in 'done' status
- [ ] Check implementation_plan.json contains `"status": "done"` and `"planStatus": "completed"`
