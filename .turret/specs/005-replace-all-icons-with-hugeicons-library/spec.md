# Specification: Replace All Icons with Hugeicons Library

## Overview

This task involves a comprehensive migration from Lucide React icons to Hugeicons Duotone icons across the entire frontend codebase. The goal is to standardize the visual language using the Hugeicons Duotone style, which provides a distinctive two-layer design (filled background + stroked foreground). The source icons are already available locally at `.refs/icons/hugeicons/Duotone/` with 57 categories containing thousands of SVG icons. This migration requires processing the SVGs for theme compatibility, creating React components, and systematically replacing 170+ files that currently import from Lucide React.

## Workflow Type

**Type**: ui_ux (Visual Consistency Update)

**Rationale**: This is a comprehensive UI/UX standardization task that:
- Affects visual presentation across 170+ component files
- Requires consistent styling and theme integration
- Does not change application logic or data flow
- Focuses on visual identity and user experience consistency

## Task Scope

### Services Involved
- **frontend** (primary) - All icon usage is within the Electron React application
- **No backend changes** - Backend has no icon dependencies

### This Task Will:
- [ ] Create an SVG preprocessing pipeline to convert hardcoded colors to theme-aware CSS variables
- [ ] Configure SVGR in electron-vite to import SVGs as React components
- [ ] Create icon mapping from Lucide names to Hugeicons equivalents (~125 icons)
- [ ] Replace all icons in `apps/frontend/src/renderer/lib/icons.ts` with Hugeicons components
- [ ] Update 170+ component files to use the new icon exports
- [ ] Verify theme compatibility (dark/light mode switching)
- [ ] Remove `lucide-react` dependency from package.json

### Out of Scope:
- Backend service modifications
- Creating new custom icons not in Hugeicons library
- Changing icon sizes or spacing (maintain existing dimensions)
- Animation or interaction changes to icons

## Service Context

### Frontend Service

**Tech Stack:**
- Language: TypeScript
- Framework: React 19
- Build Tool: electron-vite 5.0
- Styling: Tailwind CSS 4
- State Management: Zustand

**Entry Point:** `apps/frontend/src/renderer/index.html`

**How to Run:**
```bash
cd apps/frontend
npm run dev
```

**Port:** 3000 (Electron renderer)

**Key Directories:**
- `src/renderer/lib/` - Centralized utilities and exports
- `src/renderer/components/` - All UI components using icons

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| `apps/frontend/src/renderer/lib/icons.ts` | frontend | Replace all Lucide exports with Hugeicons components |
| `apps/frontend/electron.vite.config.ts` | frontend | Add SVGR plugin configuration for SVG imports |
| `apps/frontend/package.json` | frontend | Add vite-plugin-svgr, remove lucide-react |
| `apps/frontend/src/renderer/components/*.tsx` (170 files) | frontend | Update imports from `lucide-react` to `@/lib/icons` |
| `.refs/icons/hugeicons/Duotone/**/*.svg` | assets | Preprocess to replace hardcoded colors |

### Component Files Requiring Icon Import Updates

The following 170 files directly import from `lucide-react` and need updating:

**High-Impact Directories:**
- `apps/frontend/src/renderer/components/settings/` (12 files)
- `apps/frontend/src/renderer/components/task-detail/` (15 files)
- `apps/frontend/src/renderer/components/project-settings/` (15 files)
- `apps/frontend/src/renderer/components/ideation/` (12 files)
- `apps/frontend/src/renderer/components/onboarding/` (9 files)
- `apps/frontend/src/renderer/components/github-**/` (15 files)
- `apps/frontend/src/renderer/components/changelog/` (10 files)
- `apps/frontend/src/renderer/components/roadmap/` (7 files)
- `apps/frontend/src/renderer/components/ui/` (6 files)

## Files to Reference

These files show patterns to follow:

| File | Pattern to Copy |
|------|----------------|
| `apps/frontend/src/renderer/lib/icons.ts` | Centralized icon export pattern |
| `apps/frontend/electron.vite.config.ts` | Vite plugin configuration pattern |
| `.refs/icons/hugeicons/Duotone/Alert Notification/alert-circle.svg` | Duotone SVG structure |

## Patterns to Follow

### Current Icon Export Pattern

From `apps/frontend/src/renderer/lib/icons.ts`:

```typescript
/**
 * Centralized Icon Exports
 * Usage: import { AlertCircle, Check, X } from '@/lib/icons';
 */
export {
  Activity,
  AlertCircle,
  AlertTriangle,
  // ... alphabetically ordered
} from 'lucide-react';
```

**Key Points:**
- Single source of truth for all icon imports
- Alphabetically ordered exports
- Clear usage documentation in comments

### Hugeicons SVG Structure

From `.refs/icons/hugeicons/Duotone/Alert Notification/alert-01.svg`:

```xml
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="..." fill="#D4D7E0"/>
  <path d="..." stroke="#141B34" stroke-width="1.5"/>
  <path d="..." stroke="#141B34" stroke-width="1.5" stroke-linecap="round"/>
</svg>
```

**Key Points:**
- 24x24 default size (matches Lucide)
- Two-layer structure: fill paths + stroke paths
- Hardcoded colors: `#D4D7E0` (fill), `#141B34` (stroke)
- Must replace with CSS variables for theming

### Target Icon Component Pattern

```typescript
// apps/frontend/src/renderer/lib/icons.ts
import AlertCircle from '@icons/alert-circle.svg?react';
import AlertTriangle from '@icons/alert-triangle.svg?react';

export {
  AlertCircle,
  AlertTriangle,
  // ... alphabetically ordered
};
```

## Requirements

### Functional Requirements

1. **SVG Preprocessing**
   - Description: Convert all Hugeicons SVGs to use CSS variables instead of hardcoded colors
   - Acceptance: `fill="#D4D7E0"` replaced with `fill="var(--icon-fill, currentColor)"` and `stroke="#141B34"` replaced with `stroke="currentColor"`

2. **SVGR Configuration**
   - Description: Configure vite-plugin-svgr to import SVGs as React components
   - Acceptance: SVG files can be imported with `?react` suffix as React components

3. **Icon Mapping**
   - Description: Create 1:1 mapping from Lucide icon names to Hugeicons equivalents
   - Acceptance: All 125 currently used icons have Hugeicons replacements

4. **Component Migration**
   - Description: Update all 170 files importing from `lucide-react` to use `@/lib/icons`
   - Acceptance: Zero imports from `lucide-react` remain in codebase

5. **Theme Compatibility**
   - Description: Icons must adapt to dark/light mode
   - Acceptance: Icons visible and appropriately styled in both themes

6. **Bundle Size Optimization**
   - Description: Only import icons that are actually used
   - Acceptance: Tree-shaking works correctly, unused icons not in bundle

### Edge Cases

1. **Missing Icon Mapping** - If a Lucide icon has no exact Hugeicons equivalent, document alternatives or create custom SVG
2. **Direct lucide-react Imports** - Some files import directly; must redirect to centralized exports
3. **Icon Aliases** - Handle `Image as ImageIcon` pattern in current exports
4. **Dynamic Icon Names** - Any components using dynamic icon selection need special handling

## Implementation Notes

### DO
- Follow the existing centralized icon export pattern in `icons.ts`
- Maintain alphabetical ordering of icon exports
- Use `?react` suffix for SVGR imports
- Create a preprocessing script that can be re-run for future icon updates
- Test icon rendering in both light and dark themes
- Verify icon visibility with various Tailwind color classes

### DON'T
- Import directly from SVG files in component code (always use `@/lib/icons`)
- Change icon sizes from current implementations (maintain `size` prop behavior)
- Create unnecessary wrapper components around icons
- Modify the `.refs/icons/` source files directly (copy and preprocess)

### Technical Approach

1. **Phase 1: Setup**
   - Install `vite-plugin-svgr`
   - Configure SVGR in `electron.vite.config.ts`
   - Create preprocessed icons directory `src/renderer/assets/icons/`

2. **Phase 2: SVG Processing**
   - Create script to copy and preprocess SVGs from `.refs/icons/hugeicons/Duotone/`
   - Replace hardcoded colors with CSS variables/currentColor
   - Flatten category directories into single icons directory

3. **Phase 3: Icon Mapping**
   - Create mapping file documenting Lucide → Hugeicons equivalents
   - Handle naming convention differences (PascalCase → kebab-case)
   - Document any icons without direct equivalents

4. **Phase 4: Migration**
   - Update `icons.ts` to import from processed Hugeicons
   - Update all component files to use `@/lib/icons`
   - Remove `lucide-react` from dependencies

5. **Phase 5: Verification**
   - Visual inspection of all major UI areas
   - Theme switching verification
   - Bundle size comparison

## Development Environment

### Start Services

```bash
cd apps/frontend
npm install
npm run dev
```

### Service URLs
- Frontend: http://localhost:3000 (via Electron)

### Required Environment Variables
- None specific to icons

### Key Commands

```bash
# Development
npm run dev              # Start electron-vite dev server

# Testing
npm run test             # Run vitest tests
npm run typecheck        # TypeScript type checking

# Build
npm run build            # Build for production
```

## Success Criteria

The task is complete when:

1. [ ] All icons in the application use Hugeicons Duotone style
2. [ ] `lucide-react` is removed from package.json dependencies
3. [ ] Zero imports from `lucide-react` remain in codebase
4. [ ] Icons render correctly in light theme
5. [ ] Icons render correctly in dark theme
6. [ ] No console errors related to icons
7. [ ] Existing vitest tests still pass
8. [ ] TypeScript type checking passes (`npm run typecheck`)
9. [ ] Visual verification of major UI components
10. [ ] Icon mapping documentation created

## QA Acceptance Criteria

**CRITICAL**: These criteria must be verified by the QA Agent before sign-off.

### Unit Tests
| Test | File | What to Verify |
|------|------|----------------|
| Icon imports | `src/renderer/lib/icons.test.ts` | All exported icons are valid React components |
| Icon rendering | Component tests | Icons render without errors |

### Integration Tests
| Test | Services | What to Verify |
|------|----------|----------------|
| Theme switching | frontend | Icons adapt colors when theme changes |
| Icon loading | frontend | Icons load without network requests (bundled) |

### End-to-End Tests
| Flow | Steps | Expected Outcome |
|------|-------|------------------|
| Application load | 1. Launch app 2. Verify sidebar icons | All navigation icons visible |
| Settings page | 1. Open settings 2. Check all sections | All setting icons render |
| Task creation | 1. Open task wizard 2. Navigate steps | All wizard icons visible |

### Browser Verification (Electron App)
| Page/Component | Path | Checks |
|----------------|------|--------|
| Sidebar navigation | Main window | All nav icons visible and styled |
| Settings panel | Settings modal | All setting section icons render |
| Task detail modal | Click any task | All action/status icons visible |
| Onboarding wizard | First launch | All step icons render |
| Theme toggle | Settings > Display | Icons adapt to dark/light mode |

### Visual Regression Checks
| Component | Light Theme | Dark Theme |
|-----------|-------------|------------|
| Sidebar icons | Visible, correct color | Visible, inverted color |
| Button icons | Contrast with background | Contrast with background |
| Status icons | Distinct colors maintained | Distinct colors maintained |
| Empty state icons | Visible, subdued style | Visible, subdued style |

### QA Sign-off Requirements
- [ ] All unit tests pass (`npm run test`)
- [ ] TypeScript compiles without errors (`npm run typecheck`)
- [ ] All E2E tests pass (`npm run test:e2e`)
- [ ] Visual verification in light theme complete
- [ ] Visual verification in dark theme complete
- [ ] No regressions in existing functionality
- [ ] Code follows established patterns (centralized exports)
- [ ] No security vulnerabilities introduced
- [ ] Bundle size is not significantly increased
- [ ] Icon mapping documentation exists

## Icon Mapping Reference

### Current Lucide Icons (125 total)

The following icons are currently exported from `icons.ts` and need Hugeicons equivalents:

| Lucide Name | Category | Hugeicons Equivalent |
|-------------|----------|---------------------|
| Activity | Dashboard | activity-01 |
| AlertCircle | Alert | alert-circle |
| AlertTriangle | Alert | alert-02 |
| Archive | Files | archive |
| ArrowLeft | Arrows | arrow-left-01 |
| ArrowRight | Arrows | arrow-right-01 |
| BarChart3 | Dashboard | bar-chart-03 |
| Bell | Alert | notification-01 |
| BookOpen | Education | book-open |
| Bot | AI | robot |
| Box | Package | box |
| Brain | AI | brain |
| Bug | Development | bug-01 |
| Calendar | Date Time | calendar-01 |
| Check | Validation | check |
| CheckCircle | Validation | checkmark-circle-01 |
| CheckCircle2 | Validation | checkmark-circle-02 |
| CheckSquare | Validation | checkmark-square-01 |
| ChevronDown | Arrows | chevron-down |
| ChevronRight | Arrows | chevron-right |
| ChevronUp | Arrows | chevron-up |
| Circle | Shapes | circle |
| Clock | Time | clock-01 |
| CloudDownload | Download | cloud-download |
| Code | Development | code |
| Code2 | Development | code-folder |
| Cog | Settings | settings-01 |
| Copy | Edit | copy-01 |
| Cpu | Devices | cpu |
| CreditCard | Finance | credit-card |
| Database | Data | database |
| Download | Download | download-01 |
| ExternalLink | Links | link-external-01 |
| Eye | View | eye |
| EyeOff | View | eye-off |
| File | Files | file-01 |
| FileCode | Files | file-code |
| FileDown | Files | file-download |
| FileImage | Files | file-image |
| FileJson | Files | file-script |
| FileText | Files | file-text |
| Filter | Filter | filter |
| FlaskConical | Science | flask |
| Folder | Files | folder-01 |
| FolderGit2 | Files | folder-git |
| FolderOpen | Files | folder-open |
| FolderPlus | Files | folder-add |
| FolderSearch | Files | folder-search |
| FolderTree | Files | folder-tree |
| FolderX | Files | folder-remove |
| Gauge | Dashboard | gauge |
| GitBranch | Git | git-branch |
| GitCommit | Git | git-commit |
| Github | Brand | github |
| GitMerge | Git | git-merge |
| Globe | Web | globe |
| Grid2X2 | Layout | grid |
| HardDrive | Devices | hard-drive |
| HelpCircle | Help | help-circle |
| History | Time | history |
| Image | Media | image-01 |
| Import | Transfer | import |
| Inbox | Mail | inbox |
| Info | Alert | information-circle |
| Key | Security | key-01 |
| KeyRound | Security | key-02 |
| Layers | Layout | layers-01 |
| LayoutGrid | Layout | layout-grid |
| Lightbulb | Idea | lightbulb |
| ListChecks | Lists | list-check |
| ListTodo | Lists | list-todo |
| Loader2 | Loading | loading-01 |
| Lock | Security | lock |
| LogIn | Auth | login |
| Mail | Communications | mail-01 |
| Map | Navigation | map |
| MessageCircle | Communications | message-circle |
| MessageSquare | Communications | message-square |
| Minus | Math | minus |
| Monitor | Devices | monitor |
| Moon | Theme | moon |
| MoreVertical | Menu | more-vertical |
| Package | Package | package |
| Palette | Design | palette |
| PanelLeft | Layout | panel-left |
| PanelLeftClose | Layout | panel-left-close |
| PartyPopper | Celebration | party-popper |
| Pencil | Edit | pencil-edit-01 |
| PenLine | Edit | pen-line |
| Play | Media | play |
| Plus | Math | plus |
| Radio | Media | radio |
| RefreshCw | Actions | refresh |
| Rocket | Launch | rocket |
| RotateCcw | Actions | rotate-ccw |
| Route | Navigation | route |
| Save | Actions | save |
| Scale | Measure | scale |
| Search | Search | search-01 |
| Send | Communications | send |
| Server | Infrastructure | server |
| Settings | Settings | settings-02 |
| Settings2 | Settings | settings-03 |
| Shield | Security | shield |
| Sliders | Controls | sliders |
| Sparkles | Effects | sparkles |
| Square | Shapes | square |
| Star | Rating | star |
| Sun | Theme | sun |
| Tag | Labels | tag |
| Target | Goals | target |
| Terminal | Development | terminal |
| TerminalSquare | Development | terminal-square |
| ThumbsUp | Feedback | thumbs-up |
| Trash2 | Delete | trash |
| TrendingUp | Analytics | trending-up |
| Upload | Upload | upload-01 |
| User | Users | user |
| Users | Users | users |
| Wand2 | Magic | magic-wand |
| Wifi | Network | wifi |
| Wrench | Tools | wrench |
| X | Close | x |
| XCircle | Close | x-circle |
| Zap | Energy | zap |

**Note:** This mapping will be refined during implementation as exact Hugeicons filenames are verified.

## Appendix: Hugeicons Directory Structure

```
.refs/icons/hugeicons/Duotone/
├── Add Remove Delete/
├── Alert Notification/
├── Animation/
├── Arrows (Round)/
├── Arrows (Sharp)/
├── Award Reward/
├── Bookmark Favorite/
├── Brand Logo/
├── Building Landmark Places/
├── Business and Finance/
├── Check Validation/
├── Communications/
├── Dashboard/
├── Date and Time/
├── Devices/
├── Download Upload/
├── E-Commerce/
├── Edit Formatting/
├── Education/
├── Energy/
├── Files Folders/
├── Filter Sorting/
... (57 categories total)
```

Each category contains multiple SVG files in kebab-case naming convention (e.g., `alert-circle.svg`, `home-01.svg`).
