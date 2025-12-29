# Quick Spec: Move Refine with AI Button to Icon

## Task
Move the "Refine with AI" button to be an icon-only button positioned to the left of the Description label.

## Files to Modify
- `apps/frontend/src/renderer/components/TaskCreationWizard.tsx` - Move and restyle the button

## Change Details
1. **Remove current button** from lines 872-891 (inside the `flex justify-between` div below textarea)
2. **Add icon-only button** next to the Description label at line 805
3. **Button styling**:
   - Icon-only (Sparkles icon, no text)
   - Small size, minimal appearance
   - Ghost variant for subtle look
   - Show loading spinner when refining
   - Keep same disabled logic and click handler

## Current Structure (lines 803-807)
```tsx
<div className="space-y-2">
  <Label htmlFor="description" ...>
    Description <span>*</span>
  </Label>
```

## New Structure
```tsx
<div className="space-y-2">
  <div className="flex items-center gap-2">
    <Label htmlFor="description" ...>
      Description <span>*</span>
    </Label>
    <Button icon-only variant="ghost" size="icon" ... />
  </div>
```

## Verification
- [ ] Sparkles icon appears to the right of "Description" label
- [ ] No text on button, just icon
- [ ] Button triggers AI refinement on click
- [ ] Loading spinner shows during refinement
- [ ] Button disabled when description is empty or refining
