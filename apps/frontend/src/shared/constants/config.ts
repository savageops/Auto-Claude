/**
 * Application configuration constants
 * Default settings, file paths, and project structure
 */

// ============================================
// UI Scale Constants
// ============================================

export const UI_SCALE_MIN = 75;
export const UI_SCALE_MAX = 200;
export const UI_SCALE_DEFAULT = 100;
export const UI_SCALE_STEP = 5;

// ============================================
// Default App Settings
// ============================================

export const DEFAULT_APP_SETTINGS = {
  theme: 'system' as const,
  colorTheme: 'default' as const,
  defaultModel: 'opus',
  agentFramework: 'turret',
  pythonPath: undefined as string | undefined,
  autoBuildPath: undefined as string | undefined,
  autoUpdateAutoBuild: true,
  autoNameTerminals: true,
  onboardingCompleted: false,
  notifications: {
    onTaskComplete: true,
    onTaskFailed: true,
    onReviewNeeded: true,
    sound: false
  },
  // Global API keys (used as defaults for all projects)
  globalClaudeOAuthToken: undefined as string | undefined,
  globalOpenAIApiKey: undefined as string | undefined,
  // Selected agent profile - defaults to 'auto' for per-phase optimized model selection
  selectedAgentProfile: 'auto',
  // Changelog preferences (persisted between sessions)
  changelogFormat: 'keep-a-changelog' as const,
  changelogAudience: 'user-facing' as const,
  changelogEmojiLevel: 'none' as const,
  // UI Scale (default 100% - standard size)
  uiScale: UI_SCALE_DEFAULT,
  // Beta updates opt-in (receive pre-release versions)
  betaUpdates: false,
  // Language preference (default to English)
  language: 'en' as const,
  // Prompt configuration (defaults match current backend prompts)
  promptConfig: {
    merge: {
      systemPrompt: "You are an expert code merge assistant. Your primary goal is to preserve ALL functionality from ALL tasks being merged. Never remove features or reduce code quality. When in doubt, include more rather than less.",
      preventDeletion: true,
      preventFeatureReduction: true,
      preserveAllImports: true,
      preserveAllHooks: true,
      preserveAllProps: true,
      preserveAllState: true,
      combineConflicts: true,
      includeMoreWhenUncertain: true,
      customInstructions: undefined
    },
    taskExecution: {
      plannerInstructions: undefined,
      coderInstructions: undefined,
      qaInstructions: undefined
    },
    globalInstructions: undefined
  }
};

// ============================================
// Default Project Settings
// ============================================

export const DEFAULT_PROJECT_SETTINGS = {
  model: 'opus',
  memoryBackend: 'file' as const,
  linearSync: false,
  notifications: {
    onTaskComplete: true,
    onTaskFailed: true,
    onReviewNeeded: true,
    sound: false
  },
  // Graphiti MCP server for agent-accessible knowledge graph (enabled by default)
  graphitiMcpEnabled: true,
  graphitiMcpUrl: 'http://localhost:8000/mcp/'
};

// ============================================
// Auto Build File Paths
// ============================================

// File paths relative to project
// IMPORTANT: All paths use .turret/ (the installed instance), NOT turret/ (source code)
export const AUTO_BUILD_PATHS = {
  SPECS_DIR: '.turret/specs',
  ROADMAP_DIR: '.turret/roadmap',
  IDEATION_DIR: '.turret/ideation',
  IMPLEMENTATION_PLAN: 'implementation_plan.json',
  SPEC_FILE: 'spec.md',
  QA_REPORT: 'qa_report.md',
  BUILD_PROGRESS: 'build-progress.txt',
  CONTEXT: 'context.json',
  REQUIREMENTS: 'requirements.json',
  ROADMAP_FILE: 'roadmap.json',
  ROADMAP_DISCOVERY: 'roadmap_discovery.json',
  COMPETITOR_ANALYSIS: 'competitor_analysis.json',
  IDEATION_FILE: 'ideation.json',
  IDEATION_CONTEXT: 'ideation_context.json',
  PROJECT_INDEX: '.turret/project_index.json',
  GRAPHITI_STATE: '.graphiti_state.json'
} as const;

/**
 * Get the specs directory path.
 * All specs go to .turret/specs/ (the project's data directory).
 */
export function getSpecsDir(autoBuildPath: string | undefined): string {
  const basePath = autoBuildPath || '.turret';
  return `${basePath}/specs`;
}
