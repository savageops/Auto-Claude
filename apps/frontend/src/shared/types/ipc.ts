/**
 * IPC (Inter-Process Communication) types for Electron API
 */

import type { IPCResult } from './common';
import type {
  Project,
  ProjectSettings,
  AutoBuildVersionInfo,
  InitializationResult,
  CreateProjectFolderResult,
  FileNode,
  ProjectContextData,
  ProjectIndex,
  GraphitiMemoryStatus,
  ContextSearchResult,
  MemoryEpisode,
  ProjectEnvConfig,
  InfrastructureStatus,
  GraphitiValidationResult,
  GraphitiConnectionTestResult,
  GitStatus
} from './project';
import type {
  Task,
  TaskStatus,
  TaskStartOptions,
  ImplementationPlan,
  ExecutionProgress,
  WorktreeStatus,
  WorktreeDiff,
  WorktreeMergeResult,
  WorktreeDiscardResult,
  WorktreeDiscardFileResult,
  WorktreeListResult,
  TaskRecoveryResult,
  TaskRecoveryOptions,
  TaskMetadata,
  TaskLogs,
  TaskLogStreamChunk,
  TaskRefinementResult
} from './task';
import type {
  TerminalCreateOptions,
  TerminalSession,
  TerminalRestoreResult,
  SessionDateInfo,
  SessionDateRestoreResult,
  RateLimitInfo,
  SDKRateLimitInfo,
  RetryWithProfileRequest
} from './terminal';
import type {
  ClaudeProfileSettings,
  ClaudeProfile,
  ClaudeAutoSwitchSettings,
  ClaudeAuthResult,
  ClaudeUsageSnapshot
} from './agent';
import type { AppSettings, SourceEnvConfig, SourceEnvCheckResult, AutoBuildSourceUpdateCheck, AutoBuildSourceUpdateProgress } from './settings';
import type { AppUpdateInfo, AppUpdateProgress, AppUpdateAvailableEvent, AppUpdateDownloadedEvent } from './app-update';
import type {
  ChangelogTask,
  TaskSpecContent,
  ChangelogGenerationRequest,
  ChangelogGenerationResult,
  ChangelogSaveRequest,
  ChangelogSaveResult,
  ChangelogGenerationProgress,
  ExistingChangelog,
  GitBranchInfo,
  GitTagInfo,
  GitCommit,
  GitHistoryOptions,
  BranchDiffOptions,
  ReleaseableVersion,
  ReleasePreflightStatus,
  CreateReleaseRequest,
  CreateReleaseResult,
  ReleaseProgress
} from './changelog';
import type {
  IdeationSession,
  IdeationConfig,
  IdeationStatus,
  IdeationGenerationStatus,
  Idea,
  InsightsSession,
  InsightsSessionSummary,
  InsightsChatStatus,
  InsightsStreamChunk,
  InsightsModelConfig
} from './insights';
import type {
  Roadmap,
  RoadmapFeatureStatus,
  RoadmapGenerationStatus
} from './roadmap';
import type {
  LinearTeam,
  LinearProject,
  LinearIssue,
  LinearImportResult,
  LinearSyncStatus,
  GitHubRepository,
  GitHubIssue,
  GitHubSyncStatus,
  GitHubImportResult,
  GitHubInvestigationResult,
  GitHubInvestigationStatus
} from './integrations';

// Electron API exposed via contextBridge
// Tab state interface (persisted in main process)
export interface TabState {
  openProjectIds: string[];
  activeProjectId: string | null;
  tabOrder: string[];
}

export interface ElectronAPI {
  // Project operations
  addProject: (projectPath: string) => Promise<IPCResult<Project>>;
  removeProject: (projectId: string) => Promise<IPCResult>;
  getProjects: () => Promise<IPCResult<Project[]>>;
  updateProjectSettings: (projectId: string, settings: Partial<ProjectSettings>) => Promise<IPCResult>;
  initializeProject: (projectId: string) => Promise<IPCResult<InitializationResult>>;
  updateProjectAutoBuild: (projectId: string) => Promise<IPCResult<InitializationResult>>;
  checkProjectVersion: (projectId: string) => Promise<IPCResult<AutoBuildVersionInfo>>;

  // Tab State (persisted in main process for reliability)
  getTabState: () => Promise<IPCResult<TabState>>;
  saveTabState: (tabState: TabState) => Promise<IPCResult>;

  // Task operations
  getTasks: (projectId: string) => Promise<IPCResult<Task[]>>;
  createTask: (projectId: string, title: string, description: string, metadata?: TaskMetadata) => Promise<IPCResult<Task>>;
  deleteTask: (taskId: string) => Promise<IPCResult>;
  updateTask: (taskId: string, updates: { title?: string; description?: string }) => Promise<IPCResult<Task>>;
  startTask: (taskId: string, options?: TaskStartOptions) => void;
  stopTask: (taskId: string) => void;
  restartTask: (taskId: string) => Promise<IPCResult>;
  submitReview: (taskId: string, approved: boolean, feedback?: string) => Promise<IPCResult>;
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<IPCResult>;
  recoverStuckTask: (taskId: string, options?: TaskRecoveryOptions) => Promise<IPCResult<TaskRecoveryResult>>;
  checkTaskRunning: (taskId: string) => Promise<IPCResult<boolean>>;
  refineTask: (briefDescription: string) => Promise<IPCResult<TaskRefinementResult>>;
  saveUserRedirect: (taskId: string, instruction: string) => Promise<IPCResult>;

  // Task Phase Logs
  getTaskLogs: (projectId: string, specId: string) => Promise<IPCResult<TaskLogs | null>>;
  watchTaskLogs: (projectId: string, specId: string) => Promise<IPCResult>;
  unwatchTaskLogs: (specId: string) => Promise<IPCResult>;
  onTaskLogsChanged: (callback: (specId: string, logs: TaskLogs) => void) => () => void;
  onTaskLogsStream: (callback: (specId: string, chunk: TaskLogStreamChunk) => void) => () => void;

  // Workspace management (for human review)
  // Per-spec architecture: Each spec has its own worktree at .worktrees/{spec-name}/
  getWorktreeStatus: (taskId: string) => Promise<IPCResult<WorktreeStatus>>;
  getWorktreeDiff: (taskId: string) => Promise<IPCResult<WorktreeDiff>>;
  mergeWorktree: (taskId: string, options?: { noCommit?: boolean }) => Promise<IPCResult<WorktreeMergeResult>>;
  mergeWorktreePreview: (taskId: string) => Promise<IPCResult<WorktreeMergeResult>>;
  discardWorktree: (taskId: string) => Promise<IPCResult<WorktreeDiscardResult>>;
  discardWorktreeFile: (taskId: string, filePath: string) => Promise<IPCResult<WorktreeDiscardFileResult>>;
  getWorktreeConflictDiff: (taskId: string, filePath: string) => Promise<IPCResult<string>>;
  listWorktrees: (projectId: string) => Promise<IPCResult<WorktreeListResult>>;

  // Task archive operations
  archiveTasks: (projectId: string, taskIds: string[], version?: string) => Promise<IPCResult<boolean>>;
  unarchiveTasks: (projectId: string, taskIds: string[]) => Promise<IPCResult<boolean>>;

  // Event listeners
  onTaskProgress: (callback: (taskId: string, plan: ImplementationPlan) => void) => () => void;
  onTaskError: (callback: (taskId: string, error: string) => void) => () => void;
  onTaskLog: (callback: (taskId: string, log: string) => void) => () => void;
  onTaskStatusChange: (callback: (taskId: string, status: TaskStatus) => void) => () => void;
  onTaskExecutionProgress: (callback: (taskId: string, progress: ExecutionProgress) => void) => () => void;

  // Terminal operations
  createTerminal: (options: TerminalCreateOptions) => Promise<IPCResult>;
  destroyTerminal: (id: string) => Promise<IPCResult>;
  sendTerminalInput: (id: string, data: string) => void;
  resizeTerminal: (id: string, cols: number, rows: number) => void;
  invokeClaudeInTerminal: (id: string, cwd?: string) => void;
  generateTerminalName: (command: string, cwd?: string) => Promise<IPCResult<string>>;

  // Terminal session management (persistence/restore)
  getTerminalSessions: (projectPath: string) => Promise<IPCResult<TerminalSession[]>>;
  restoreTerminalSession: (session: TerminalSession, cols?: number, rows?: number) => Promise<IPCResult<TerminalRestoreResult>>;
  clearTerminalSessions: (projectPath: string) => Promise<IPCResult>;
  resumeClaudeInTerminal: (id: string, sessionId?: string) => void;
  getTerminalSessionDates: (projectPath?: string) => Promise<IPCResult<SessionDateInfo[]>>;
  getTerminalSessionsForDate: (date: string, projectPath: string) => Promise<IPCResult<TerminalSession[]>>;
  restoreTerminalSessionsFromDate: (date: string, projectPath: string, cols?: number, rows?: number) => Promise<IPCResult<SessionDateRestoreResult>>;
  saveTerminalBuffer: (terminalId: string, serialized: string) => Promise<void>;

  // Terminal event listeners
  onTerminalOutput: (callback: (id: string, data: string) => void) => () => void;
  onTerminalExit: (callback: (id: string, exitCode: number) => void) => () => void;
  onTerminalTitleChange: (callback: (id: string, title: string) => void) => () => void;
  onTerminalClaudeSession: (callback: (id: string, sessionId: string) => void) => () => void;
  onTerminalRateLimit: (callback: (info: RateLimitInfo) => void) => () => void;
  /** Listen for OAuth authentication completion (token is auto-saved to profile, never exposed to frontend) */
  onTerminalOAuthToken: (callback: (info: {
    terminalId: string;
    profileId?: string;
    email?: string;
    success: boolean;
    message?: string;
    detectedAt: string
  }) => void) => () => void;

  // Claude profile management (multi-account support)
  getClaudeProfiles: () => Promise<IPCResult<ClaudeProfileSettings>>;
  saveClaudeProfile: (profile: ClaudeProfile) => Promise<IPCResult<ClaudeProfile>>;
  deleteClaudeProfile: (profileId: string) => Promise<IPCResult>;
  renameClaudeProfile: (profileId: string, newName: string) => Promise<IPCResult>;
  setActiveClaudeProfile: (profileId: string) => Promise<IPCResult>;
  /** Switch terminal to use a different Claude profile (restarts Claude with new config) */
  switchClaudeProfile: (terminalId: string, profileId: string) => Promise<IPCResult>;
  /** Initialize authentication for a Claude profile */
  initializeClaudeProfile: (profileId: string) => Promise<IPCResult>;
  /** Set OAuth token for a profile (used when capturing from terminal) */
  setClaudeProfileToken: (profileId: string, token: string, email?: string) => Promise<IPCResult>;
  /** Get auto-switch settings */
  getAutoSwitchSettings: () => Promise<IPCResult<ClaudeAutoSwitchSettings>>;
  /** Update auto-switch settings */
  updateAutoSwitchSettings: (settings: Partial<ClaudeAutoSwitchSettings>) => Promise<IPCResult>;
  /** Request usage fetch from a terminal (sends /usage command) */
  fetchClaudeUsage: (terminalId: string) => Promise<IPCResult>;
  /** Get the best available profile (for manual switching) */
  getBestAvailableProfile: (excludeProfileId?: string) => Promise<IPCResult<ClaudeProfile | null>>;
  /** Listen for SDK/CLI rate limit events (non-terminal) */
  onSDKRateLimit: (callback: (info: SDKRateLimitInfo) => void) => () => void;
  /** Retry a rate-limited operation with a different profile */
  retryWithProfile: (request: RetryWithProfileRequest) => Promise<IPCResult>;

  // Usage Monitoring (Proactive Account Switching)
  /** Request current usage snapshot */
  requestUsageUpdate: () => Promise<IPCResult<ClaudeUsageSnapshot | null>>;
  /** Listen for usage data updates */
  onUsageUpdated: (callback: (usage: ClaudeUsageSnapshot) => void) => () => void;
  /** Listen for proactive swap notifications */
  onProactiveSwapNotification: (callback: (notification: {
    fromProfile: { id: string; name: string };
    toProfile: { id: string; name: string };
    reason: string;
    usageSnapshot: ClaudeUsageSnapshot;
  }) => void) => () => void;

  // App settings
  getSettings: () => Promise<IPCResult<AppSettings>>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<IPCResult>;

  // Dialog operations
  selectDirectory: () => Promise<string | null>;
  createProjectFolder: (location: string, name: string, initGit: boolean) => Promise<IPCResult<CreateProjectFolderResult>>;
  getDefaultProjectLocation: () => Promise<string | null>;

  // App info
  getAppVersion: () => Promise<string>;

  // Roadmap operations
  getRoadmap: (projectId: string) => Promise<IPCResult<Roadmap | null>>;
  getRoadmapStatus: (projectId: string) => Promise<IPCResult<{ isRunning: boolean }>>;
  saveRoadmap: (projectId: string, roadmap: Roadmap) => Promise<IPCResult>;
  generateRoadmap: (projectId: string, enableCompetitorAnalysis?: boolean, refreshCompetitorAnalysis?: boolean) => void;
  refreshRoadmap: (projectId: string, enableCompetitorAnalysis?: boolean, refreshCompetitorAnalysis?: boolean) => void;
  stopRoadmap: (projectId: string) => Promise<IPCResult>;
  updateFeatureStatus: (
    projectId: string,
    featureId: string,
    status: RoadmapFeatureStatus
  ) => Promise<IPCResult>;
  convertFeatureToSpec: (
    projectId: string,
    featureId: string
  ) => Promise<IPCResult<Task>>;

  // Roadmap event listeners
  onRoadmapProgress: (
    callback: (projectId: string, status: RoadmapGenerationStatus) => void
  ) => () => void;
  onRoadmapComplete: (
    callback: (projectId: string, roadmap: Roadmap) => void
  ) => () => void;
  onRoadmapError: (
    callback: (projectId: string, error: string) => void
  ) => () => void;
  onRoadmapStopped: (
    callback: (projectId: string) => void
  ) => () => void;

  // Context operations
  getProjectContext: (projectId: string) => Promise<IPCResult<ProjectContextData>>;
  refreshProjectIndex: (projectId: string) => Promise<IPCResult<ProjectIndex>>;
  getMemoryStatus: (projectId: string) => Promise<IPCResult<GraphitiMemoryStatus>>;
  searchMemories: (projectId: string, query: string) => Promise<IPCResult<ContextSearchResult[]>>;
  getRecentMemories: (projectId: string, limit?: number) => Promise<IPCResult<MemoryEpisode[]>>;

  // Environment configuration operations
  getProjectEnv: (projectId: string) => Promise<IPCResult<ProjectEnvConfig>>;
  updateProjectEnv: (projectId: string, config: Partial<ProjectEnvConfig>) => Promise<IPCResult>;
  checkClaudeAuth: (projectId: string) => Promise<IPCResult<ClaudeAuthResult>>;
  invokeClaudeSetup: (projectId: string) => Promise<IPCResult<ClaudeAuthResult>>;

  // Memory Infrastructure operations (LadybugDB - no Docker required)
  getMemoryInfrastructureStatus: (dbPath?: string) => Promise<IPCResult<InfrastructureStatus>>;
  listMemoryDatabases: (dbPath?: string) => Promise<IPCResult<string[]>>;
  testMemoryConnection: (dbPath?: string, database?: string) => Promise<IPCResult<GraphitiValidationResult>>;

  // Graphiti validation operations
  validateLLMApiKey: (provider: string, apiKey: string) => Promise<IPCResult<GraphitiValidationResult>>;
  testGraphitiConnection: (config: {
    dbPath?: string;
    database?: string;
    llmProvider: string;
    apiKey: string;
  }) => Promise<IPCResult<GraphitiConnectionTestResult>>;

  // Linear integration operations
  getLinearTeams: (projectId: string) => Promise<IPCResult<LinearTeam[]>>;
  getLinearProjects: (projectId: string, teamId: string) => Promise<IPCResult<LinearProject[]>>;
  getLinearIssues: (projectId: string, teamId?: string, projectId_?: string) => Promise<IPCResult<LinearIssue[]>>;
  importLinearIssues: (projectId: string, issueIds: string[]) => Promise<IPCResult<LinearImportResult>>;
  checkLinearConnection: (projectId: string) => Promise<IPCResult<LinearSyncStatus>>;

  // GitHub integration operations
  getGitHubRepositories: (projectId: string) => Promise<IPCResult<GitHubRepository[]>>;
  getGitHubIssues: (projectId: string, state?: 'open' | 'closed' | 'all') => Promise<IPCResult<GitHubIssue[]>>;
  getGitHubIssue: (projectId: string, issueNumber: number) => Promise<IPCResult<GitHubIssue>>;
  checkGitHubConnection: (projectId: string) => Promise<IPCResult<GitHubSyncStatus>>;
  investigateGitHubIssue: (projectId: string, issueNumber: number, selectedCommentIds?: number[]) => void;
  getIssueComments: (projectId: string, issueNumber: number) => Promise<IPCResult<Array<{ id: number; body: string; user: { login: string; avatar_url?: string }; created_at: string; updated_at: string }>>>;
  importGitHubIssues: (projectId: string, issueNumbers: number[]) => Promise<IPCResult<GitHubImportResult>>;
  createGitHubRelease: (
    projectId: string,
    version: string,
    releaseNotes: string,
    options?: { draft?: boolean; prerelease?: boolean }
  ) => Promise<IPCResult<{ url: string }>>;

  // GitHub OAuth operations (gh CLI)
  checkGitHubCli: () => Promise<IPCResult<{ installed: boolean; version?: string }>>;
  checkGitHubAuth: () => Promise<IPCResult<{ authenticated: boolean }>>;
  getGitHubAuthStatus: (projectId: string) => Promise<IPCResult<GitHubSyncStatus>>;
  setupGitHubIntegration: (projectId: string) => void;
  onGitHubAuthComplete: (callback: (status: GitHubSyncStatus) => void) => () => void;

  // Insights operations
  startInsightsSession: (projectId: string, config: IdeationConfig) => Promise<IPCResult<IdeationSession>>;
  stopInsightsSession: (sessionId: string) => Promise<IPCResult>;
  chatInsights: (sessionId: string, message: string) => Promise<IPCResult<InsightsStreamChunk[]>>;
  getInsightsHistory: (projectId: string) => Promise<IPCResult<InsightsSession[]>>;

  // Insights event listeners
  onInsightsProgress: (callback: (sessionId: string, status: InsightsChatStatus) => void) => () => void;

  // Changelog operations
  getChangelog: (projectId: string) => Promise<IPCResult<ExistingChangelog | null>>;
  generateChangelog: (request: ChangelogGenerationRequest) => void;
  saveChangelog: (request: ChangelogSaveRequest) => Promise<IPCResult<ChangelogSaveResult>>;
  getGitHistory: (projectId: string, options: GitHistoryOptions) => Promise<IPCResult<GitCommit[]>>;
  getGitBranches: (projectId: string) => Promise<IPCResult<GitBranchInfo[]>>;
  getGitTags: (projectId: string) => Promise<IPCResult<GitTagInfo[]>>;
  compareBranches: (projectId: string, options: BranchDiffOptions) => Promise<IPCResult<{ commits: GitCommit[]; diffStat: string }>>;
  getReleaseableVersions: (projectId: string) => Promise<IPCResult<ReleaseableVersion[]>>;
  checkReleasePreflightStatus: (projectId: string, version: string) => Promise<IPCResult<ReleasePreflightStatus>>;
  createRelease: (request: CreateReleaseRequest) => void;
  getChangelogGenerationStatus: (projectId: string) => Promise<IPCResult<{ isRunning: boolean }>>;

  // Changelog event listeners
  onChangelogProgress: (callback: (projectId: string, progress: ChangelogGenerationProgress) => void) => () => void;
  onChangelogComplete: (callback: (projectId: string, changelog: ExistingChangelog) => void) => () => void;
  onChangelogError: (callback: (projectId: string, error: string) => void) => () => void;
  onReleaseProgress: (callback: (projectId: string, progress: ReleaseProgress) => void) => () => void;
  onReleaseComplete: (callback: (projectId: string, result: CreateReleaseResult) => void) => () => void;
  onReleaseError: (callback: (projectId: string, error: string) => void) => () => void;

  // Ideation operations
  startIdeationSession: (projectId: string, config: IdeationConfig) => Promise<IPCResult<IdeationSession>>;
  stopIdeationSession: (sessionId: string) => Promise<IPCResult>;
  generateIdeas: (sessionId: string, prompt?: string) => void;
  chatIdeation: (sessionId: string, message: string) => void;
  getIdeationHistory: (projectId: string) => Promise<IPCResult<IdeationSession[]>>;

  // Ideation event listeners
  onIdeationProgress: (callback: (sessionId: string, status: IdeationGenerationStatus) => void) => () => void;
  onIdea: (callback: (sessionId: string, idea: Idea) => void) => () => void;
  onIdeationMessage: (callback: (sessionId: string, message: string) => void) => () => void;
  onIdeationError: (callback: (sessionId: string, error: string) => void) => () => void;
  onIdeationComplete: (callback: (sessionId: string, session: IdeationSession) => void) => () => void;

  // App update operations
  checkForUpdates: () => void;
  downloadUpdate: () => Promise<IPCResult>;
  quitAndInstall: () => void;
  isUpdateAvailable: () => Promise<boolean>;
  getUpdateInfo: () => Promise<IPCResult<AppUpdateInfo | null>>;

  // App update event listeners
  onUpdateAvailable: (callback: (info: AppUpdateAvailableEvent) => void) => () => void;
  onUpdateProgress: (callback: (progress: AppUpdateProgress) => void) => () => void;
  onUpdateDownloaded: (callback: (info: AppUpdateDownloadedEvent) => void) => () => void;

  // App update operations (App-prefixed - from AppUpdateAPI)
  checkAppUpdate: () => Promise<IPCResult<AppUpdateInfo | null>>;
  downloadAppUpdate: () => Promise<IPCResult>;
  installAppUpdate: () => void;
  onAppUpdateAvailable: (callback: (info: AppUpdateAvailableEvent) => void) => () => void;
  onAppUpdateDownloaded: (callback: (info: AppUpdateDownloadedEvent) => void) => () => void;
  onAppUpdateProgress: (callback: (progress: AppUpdateProgress) => void) => () => void;

  // Git detection
  detectMainBranch: (projectPath: string) => Promise<IPCResult<string>>;

  // Changelog generation events (from ChangelogAPI)
  onChangelogGenerationProgress: (callback: (projectId: string, progress: ChangelogGenerationProgress) => void) => () => void;
  onChangelogGenerationComplete: (callback: (projectId: string, result: ChangelogGenerationResult) => void) => () => void;
  onChangelogGenerationError: (callback: (projectId: string, error: string) => void) => () => void;

  // Changelog version suggestion
  suggestChangelogVersion: (projectId: string, taskIds: string[]) => Promise<IPCResult<{ version: string; reason: string }>>;
  suggestChangelogVersionFromCommits: (projectId: string, commits: GitCommit[]) => Promise<IPCResult<{ version: string; reason: string }>>;

  // Changelog image operations
  saveChangelogImage: (projectId: string, imageData: string, filename: string) => Promise<IPCResult<{ relativePath: string; url: string }>>;
  readLocalImage: (projectPath: string, relativePath: string) => Promise<IPCResult<string>>;

  // Source environment operations
  checkSourceToken: () => Promise<IPCResult<SourceEnvCheckResult>>;
  updateSourceEnv: (config: Partial<SourceEnvConfig>) => Promise<IPCResult>;

  // GitHub API namespace - includes all auto-fix, batch, and PR operations
  github: {
    // Investigation events
    onInvestigationProgress: (callback: (projectId: string, status: GitHubInvestigationStatus) => void) => () => void;
    onInvestigationComplete: (callback: (projectId: string, result: GitHubInvestigationResult) => void) => () => void;
    onInvestigationError: (callback: (projectId: string, error: string) => void) => () => void;
    investigateIssue: (projectId: string, issueNumber: number, selectedCommentIds?: number[]) => void;

    // Auto-fix operations
    getAutoFixConfig: (projectId: string) => Promise<unknown>;
    getAutoFixQueue: (projectId: string) => Promise<unknown[]>;
    getBatches: (projectId: string) => Promise<unknown[]>;
    startAutoFix: (projectId: string, issueNumber: number) => void;

    // Auto-fix events
    onAutoFixProgress: (callback: (projectId: string, progress: unknown) => void) => () => void;
    onAutoFixComplete: (callback: (projectId: string, result: unknown) => void) => () => void;
    onAutoFixError: (callback: (projectId: string, error: { issueNumber: number; error: string }) => void) => () => void;

    // Batch events
    onBatchProgress: (callback: (projectId: string, progress: unknown) => void) => () => void;
    onBatchComplete: (callback: (projectId: string, batches: unknown[]) => void) => () => void;
    onBatchError: (callback: (projectId: string, error: { error: string }) => void) => () => void;

    // Analyze preview operations
    analyzeIssuesPreview: (projectId: string, issueNumbers?: number[], maxIssues?: number) => void;
    approveBatches: (projectId: string, approvedBatches: unknown[]) => Promise<{ success: boolean; batches?: unknown[]; error?: string }>;

    // Analyze preview events
    onAnalyzePreviewProgress: (callback: (projectId: string, progress: unknown) => void) => () => void;
    onAnalyzePreviewComplete: (callback: (projectId: string, result: unknown) => void) => () => void;
    onAnalyzePreviewError: (callback: (projectId: string, error: { error: string }) => void) => () => void;
  };
}

// Event-driven updates from main process
export interface FrontendAPI {
  onTaskLogsStream: (callback: (taskId: string, chunk: TaskLogStreamChunk) => void) => () => void;
  onTaskStatusUpdate: (callback: (status: TaskStatus) => void) => () => void;
  onGitStatusUpdate: (callback: (status: GitStatus) => void) => () => void;
}