# Specification: AI-Powered Task Refinement Button

## Overview

This feature adds a "Refine with AI" button to the task creation form that leverages Claude Haiku to automatically expand minimal user input into comprehensive, well-structured task details. When users enter a brief description and click the button, the AI intelligently populates all task fields including title, detailed description, category, priority, complexity, and impact. This streamlines the task creation workflow while ensuring consistent, high-quality task documentation by utilizing the existing inference system infrastructure.

## Workflow Type

**Type**: feature

**Rationale**: This is a new capability being added to the existing task management system. It introduces a novel user-facing feature that enhances the task creation experience without modifying core existing functionality or refactoring current code. The feature builds on top of existing infrastructure (inference system, Haiku model) while adding net-new UI and API endpoints.

## Task Scope

### Services Involved
- **frontend** (primary) - Task creation form UI, button interaction, field population logic
- **backend** (primary) - AI refinement API endpoint, Haiku model integration, response structuring

### This Task Will:
- [ ] Add "Refine with AI" button to task creation form UI
- [ ] Create backend API endpoint for AI task refinement (POST /api/tasks/refine)
- [ ] Implement prompt engineering to transform brief input into structured task data
- [ ] Auto-populate form fields (title, description, category, priority, complexity, impact) based on AI response
- [ ] Handle loading states and error conditions gracefully
- [ ] Integrate with existing Haiku model configuration
- [ ] Maintain existing task creation workflow as fallback

### Out of Scope:
- Modifying existing task editing functionality
- Adding new AI models beyond Haiku
- Creating new inference system infrastructure (we use existing)
- Bulk task refinement or batch processing
- AI-powered task suggestions or recommendations
- Task validation or quality scoring

## Service Context

### Frontend

**Tech Stack:**
- Language: TypeScript
- Framework: React
- Build Tool: Vite
- Styling: Tailwind CSS
- State Management: Zustand
- UI Components: Radix UI
- Key directories: apps/frontend/src

**Entry Point:** `apps/frontend/src/main.tsx`

**How to Run:**
```bash
cd apps/frontend
npm run dev
```

**Port:** 3000

**Key Dependencies:**
- @radix-ui/react-dialog (for modals)
- @radix-ui/react-toast (for notifications)
- Zustand (state management)

### Backend

**Tech Stack:**
- Language: Python
- Framework: FastAPI (inferred from route detection)
- Key directories: apps/backend/services

**Entry Point:** `apps/backend/main.py` (typical FastAPI entry)

**How to Run:**
```bash
cd apps/backend
pip install -r requirements.txt
python main.py
```

**Port:** 8000 (typical FastAPI default)

**Key Dependencies:**
- claude-agent-sdk (for Haiku integration)
- python-dotenv (environment configuration)

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| `apps/frontend/src/components/TaskCreationForm.tsx` | frontend | Add "Refine with AI" button, loading state, API integration |
| `apps/frontend/src/stores/taskStore.ts` | frontend | Add refinement action/state management |
| `apps/frontend/src/api/taskApi.ts` | frontend | Add refineTask API call function |
| `apps/backend/routes/tasks.py` | backend | Add POST /api/tasks/refine endpoint |
| `apps/backend/services/ai_refinement_service.py` | backend | Create new service for AI task refinement logic |
| `apps/backend/services/inference_service.py` | backend | Integrate Haiku model for task refinement prompt |

## Files to Reference

These files show patterns to follow:

| File | Pattern to Copy |
|------|----------------|
| `apps/frontend/src/components/*Form.tsx` | Form state management, validation patterns |
| `apps/frontend/src/api/*.ts` | API client setup, error handling |
| `apps/backend/routes/*.py` | FastAPI route structure, request/response models |
| `apps/backend/services/*.py` | Service layer patterns, dependency injection |

## Patterns to Follow

### Frontend: Form State Management

Expected pattern based on Zustand state management:

```typescript
// Zustand store pattern
interface TaskFormState {
  formData: TaskFormData;
  isRefining: boolean;
  refineTask: (briefDescription: string) => Promise<void>;
  updateField: (field: string, value: any) => void;
}

const useTaskStore = create<TaskFormState>((set, get) => ({
  formData: initialFormData,
  isRefining: false,
  refineTask: async (briefDescription) => {
    set({ isRefining: true });
    try {
      const refined = await taskApi.refineTask(briefDescription);
      set({ formData: refined, isRefining: false });
    } catch (error) {
      set({ isRefining: false });
      // Handle error
    }
  },
  updateField: (field, value) => set((state) => ({
    formData: { ...state.formData, [field]: value }
  }))
}));
```

**Key Points:**
- Use Zustand for state management (project standard)
- Separate loading state for refinement action
- Async action pattern with try/catch
- Immutable state updates

### Frontend: Radix UI Button Integration

```typescript
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";

<Button
  onClick={handleRefineWithAI}
  disabled={isRefining || !briefDescription}
  variant="secondary"
>
  {isRefining ? "Refining..." : "✨ Refine with AI"}
</Button>
```

**Key Points:**
- Use Radix UI button component (project standard)
- Show loading state with text change
- Disable during processing
- Use toast for success/error notifications

### Backend: FastAPI Endpoint Pattern

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

class TaskRefinementRequest(BaseModel):
    brief_description: str

class TaskRefinementResponse(BaseModel):
    title: str
    description: str
    category: str
    priority: str
    complexity: str
    impact: str

@router.post("/refine", response_model=TaskRefinementResponse)
async def refine_task(request: TaskRefinementRequest):
    try:
        refined_data = await ai_refinement_service.refine(request.brief_description)
        return refined_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

**Key Points:**
- Use Pydantic models for request/response validation
- Proper error handling with HTTPException
- Async endpoints for I/O operations
- Service layer separation

### Backend: Haiku Integration Pattern

```python
from claude_agent_sdk import ClaudeClient

class AIRefinementService:
    def __init__(self, claude_client: ClaudeClient):
        self.client = claude_client
        self.model = "claude-3-haiku-20240307"

    async def refine(self, brief_description: str) -> dict:
        prompt = self._build_refinement_prompt(brief_description)

        response = await self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )

        return self._parse_response(response)

    def _build_refinement_prompt(self, description: str) -> str:
        return f"""Given this brief task description, expand it into a complete task with the following fields:

Brief description: {description}

Please provide:
1. A clear, concise title (5-10 words)
2. A detailed description (2-3 sentences explaining what needs to be done)
3. Category (choose: feature, bug, refactor, documentation, testing)
4. Priority (choose: critical, high, medium, low)
5. Complexity (choose: simple, moderate, complex)
6. Impact (choose: high, medium, low)

Return ONLY a JSON object with these exact keys: title, description, category, priority, complexity, impact"""
```

**Key Points:**
- Use existing Claude SDK integration
- Haiku model for speed/cost efficiency
- Structured prompt with clear instructions
- JSON output for easy parsing

## Requirements

### Functional Requirements

1. **AI-Powered Task Refinement**
   - Description: User enters brief description, clicks "Refine with AI", all task fields auto-populate
   - Acceptance: Given a brief description "add login button", the AI generates title, detailed description, category (feature), priority, complexity, and impact fields

2. **Graceful Loading State**
   - Description: Show clear visual feedback during AI processing
   - Acceptance: Button shows "Refining..." text and is disabled during API call, returns to normal on completion

3. **Error Handling**
   - Description: Handle API failures, network errors, and invalid responses gracefully
   - Acceptance: If refinement fails, show error toast and keep existing form data intact

4. **Field Override Support**
   - Description: Users can manually edit AI-populated fields
   - Acceptance: After AI refinement, user can modify any field normally; manual edits are preserved

5. **Minimal Input Validation**
   - Description: Require non-empty description before allowing refinement
   - Acceptance: "Refine with AI" button is disabled when description is empty

### Edge Cases

1. **Empty Response from AI** - Return generic structured data with placeholders, show warning toast
2. **Partial Response (missing fields)** - Populate available fields, leave others empty, show info toast
3. **API Timeout** - Show timeout error after 30 seconds, suggest manual entry
4. **Invalid JSON Response** - Fallback to parsing text response, extract what's possible
5. **Rate Limiting** - Handle 429 responses, show friendly "try again in X seconds" message
6. **Concurrent Refinement Requests** - Debounce button, cancel previous request if new one initiated

## Implementation Notes

### DO
- Follow existing Zustand store patterns for state management
- Use Radix UI components for button and toast notifications
- Implement proper TypeScript types for all API requests/responses
- Use existing FastAPI route structure and Pydantic models
- Leverage existing Claude SDK integration for Haiku
- Add comprehensive error logging in backend service
- Parse AI response with fallback strategies
- Show clear loading states for better UX
- Keep the existing task creation workflow intact (this is additive)

### DON'T
- Create new inference system infrastructure (use existing)
- Modify existing task editing functionality
- Add new AI models beyond Haiku
- Block form submission if refinement fails
- Store refinement history or cache results (keep it stateless)
- Make the feature mandatory (it's an optional enhancement)
- Over-engineer the prompt (keep it simple and focused)

## Development Environment

### Start Services

```bash
# Terminal 1 - Frontend
cd apps/frontend
npm run dev

# Terminal 2 - Backend
cd apps/backend
pip install -r requirements.txt
python main.py
```

### Service URLs
- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Required Environment Variables

**Backend (.env):**
- `ANTHROPIC_API_KEY`: Claude API key for Haiku model access
- `GRAPHITI_ENABLED`: Set to "false" if not using graphiti features

**Frontend (.env):**
- `VITE_API_URL`: Backend API URL (default: http://localhost:8000)

## Success Criteria

The task is complete when:

1. [ ] User can click "Refine with AI" button in task creation form
2. [ ] Button shows loading state ("Refining...") during API processing
3. [ ] All task fields (title, description, category, priority, complexity, impact) auto-populate with AI-generated content
4. [ ] User can manually edit any AI-populated field
5. [ ] Error toast appears if refinement fails, form data remains intact
6. [ ] Button is disabled when description is empty
7. [ ] No console errors in browser or terminal
8. [ ] Existing task creation workflow still works normally
9. [ ] API endpoint returns structured JSON response
10. [ ] Response time is under 5 seconds for typical inputs

## QA Acceptance Criteria

**CRITICAL**: These criteria must be verified by the QA Agent before sign-off.

### Unit Tests

| Test | File | What to Verify |
|------|------|----------------|
| `refineTask action` | `apps/frontend/src/stores/taskStore.test.ts` | State updates correctly, loading states work |
| `AIRefinementService.refine()` | `apps/backend/services/test_ai_refinement_service.py` | Prompt construction, response parsing, error handling |
| `POST /api/tasks/refine` | `apps/backend/routes/test_tasks.py` | Request validation, response format, error codes |
| `API client refineTask()` | `apps/frontend/src/api/taskApi.test.ts` | HTTP request format, error handling |

### Integration Tests

| Test | Services | What to Verify |
|------|----------|----------------|
| Full refinement flow | frontend ↔ backend | Button click → API call → field population |
| Error handling flow | frontend ↔ backend | API error → toast notification → state reset |
| Haiku integration | backend ↔ Claude API | Prompt sent correctly, response parsed successfully |

### End-to-End Tests

| Flow | Steps | Expected Outcome |
|------|-------|------------------|
| Happy path refinement | 1. Open task form 2. Enter "add dark mode" 3. Click "Refine with AI" 4. Wait for response | All fields populated with relevant task data |
| Manual override | 1. Complete refinement 2. Edit title field manually 3. Change category | Changes persist, can still submit form |
| Empty description | 1. Open task form 2. Leave description empty | "Refine with AI" button is disabled |
| Network error | 1. Disconnect network 2. Click "Refine with AI" | Error toast appears, form data unchanged |

### Browser Verification (Frontend)

| Page/Component | URL | Checks |
|----------------|-----|--------|
| Task Creation Form | `http://localhost:3000/tasks/new` | "Refine with AI" button visible and styled correctly |
| Loading State | `http://localhost:3000/tasks/new` | Button shows "Refining..." during API call |
| Error Toast | `http://localhost:3000/tasks/new` | Toast appears on error with clear message |
| Form Field Population | `http://localhost:3000/tasks/new` | All 6 fields update simultaneously after refinement |

### API Verification (Backend)

| Check | Query/Command | Expected |
|-------|---------------|----------|
| Endpoint exists | `curl -X POST http://localhost:8000/api/tasks/refine -H "Content-Type: application/json" -d '{"brief_description":"test"}'` | 200 OK with JSON response |
| Request validation | `curl -X POST http://localhost:8000/api/tasks/refine -H "Content-Type: application/json" -d '{}'` | 422 Validation Error |
| Response structure | Check POST response | Contains all 6 fields: title, description, category, priority, complexity, impact |
| Haiku integration | Backend logs | Shows Haiku API call with correct model name |

### QA Sign-off Requirements

- [ ] All unit tests pass (`npm test` in frontend, `pytest` in backend)
- [ ] All integration tests pass
- [ ] All E2E tests pass (Playwright test suite)
- [ ] Browser verification complete (button appears, works as expected)
- [ ] API verification complete (endpoint responds correctly)
- [ ] No regressions in existing task creation flow
- [ ] Code follows established patterns (Zustand, Radix UI, FastAPI, Pydantic)
- [ ] No security vulnerabilities introduced (API key not exposed, input sanitized)
- [ ] Error handling works for all edge cases (empty response, timeout, invalid JSON)
- [ ] Performance acceptable (< 5 second response time)
- [ ] Documentation updated (API docs, component docs if applicable)

## Additional Context

### Prompt Engineering Considerations

The AI refinement prompt should be optimized for:
- **Consistency**: Always return the same JSON structure
- **Brevity**: Haiku works best with concise prompts
- **Clarity**: Clear instructions for each field
- **Examples**: May need few-shot examples for better quality

### Future Enhancements (Out of Scope)

- Historical refinement suggestions based on similar tasks
- Custom refinement templates per project
- Multi-language support for task descriptions
- Confidence scores for AI-generated fields
- A/B testing different prompt strategies
