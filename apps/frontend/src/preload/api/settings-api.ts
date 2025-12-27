import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  AppSettings,
  IPCResult,
  SourceEnvConfig,
  SourceEnvCheckResult
} from '../../shared/types';

export interface SettingsAPI {
  // App Settings
  getSettings: () => Promise<IPCResult<AppSettings>>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<IPCResult>;

  // App Info
  getAppVersion: () => Promise<string>;

  // Auto-Build Source Environment
  getSourceEnv: () => Promise<IPCResult<SourceEnvConfig>>;
  updateSourceEnv: (config: { claudeOAuthToken?: string }) => Promise<IPCResult>;
  checkSourceToken: () => Promise<IPCResult<SourceEnvCheckResult>>;

  // Prompt File Operations
  readBasePrompt: (promptType: 'planner' | 'coder' | 'qa' | 'followup_planner' | 'qa_fixer' | 'validation_fixer' | 'coder_recovery' | 'pr_fixer') => Promise<IPCResult<string>>;
  writeBasePrompt: (promptType: 'planner' | 'coder' | 'qa' | 'followup_planner' | 'qa_fixer' | 'validation_fixer' | 'coder_recovery' | 'pr_fixer', content: string) => Promise<IPCResult>;

  // Ideation Prompts
  listIdeationPrompts: () => Promise<IPCResult<Record<string, string>>>;
  readIdeationPrompt: (type: string) => Promise<IPCResult<string>>;
  writeIdeationPrompt: (type: string, content: string) => Promise<IPCResult>;

  // Roadmap Prompts
  readRoadmapPrompt: (type: 'discovery' | 'features') => Promise<IPCResult<string>>;
  writeRoadmapPrompt: (type: 'discovery' | 'features', content: string) => Promise<IPCResult>;

  // Insights Prompt
  readInsightsPrompt: () => Promise<IPCResult<string>>;
  writeInsightsPrompt: (content: string) => Promise<IPCResult>;
}

export const createSettingsAPI = (): SettingsAPI => ({
  // App Settings
  getSettings: (): Promise<IPCResult<AppSettings>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),

  saveSettings: (settings: Partial<AppSettings>): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE, settings),

  // App Info
  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),

  // Auto-Build Source Environment
  getSourceEnv: (): Promise<IPCResult<SourceEnvConfig>> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTOBUILD_SOURCE_ENV_GET),

  updateSourceEnv: (config: { claudeOAuthToken?: string }): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTOBUILD_SOURCE_ENV_UPDATE, config),

  checkSourceToken: (): Promise<IPCResult<SourceEnvCheckResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTOBUILD_SOURCE_ENV_CHECK_TOKEN),

  // Prompt File Operations
  readBasePrompt: (promptType: 'planner' | 'coder' | 'qa' | 'followup_planner' | 'qa_fixer' | 'validation_fixer' | 'coder_recovery' | 'pr_fixer'): Promise<IPCResult<string>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_READ_BASE, promptType),

  writeBasePrompt: (promptType: 'planner' | 'coder' | 'qa' | 'followup_planner' | 'qa_fixer' | 'validation_fixer' | 'coder_recovery' | 'pr_fixer', content: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_WRITE_BASE, promptType, content),

  // Ideation Prompts
  listIdeationPrompts: (): Promise<IPCResult<Record<string, string>>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_LIST_IDEATION),

  readIdeationPrompt: (type: string): Promise<IPCResult<string>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_READ_IDEATION, type),

  writeIdeationPrompt: (type: string, content: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_WRITE_IDEATION, type, content),

  // Roadmap Prompts
  readRoadmapPrompt: (type: 'discovery' | 'features'): Promise<IPCResult<string>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_READ_ROADMAP, type),

  writeRoadmapPrompt: (type: 'discovery' | 'features', content: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_WRITE_ROADMAP, type, content),

  // Insights Prompt
  readInsightsPrompt: (): Promise<IPCResult<string>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_READ_INSIGHTS),

  writeInsightsPrompt: (content: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_WRITE_INSIGHTS, content)
});
