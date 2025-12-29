import { create } from 'zustand';
import type { AppSettings } from '../../shared/types';
import { DEFAULT_APP_SETTINGS } from '../../shared/constants';

// Sequence tracking to prevent race conditions
let updateSequenceCounter = 0;
function getNextSequence(): number {
  return ++updateSequenceCounter;
}

interface SettingsState {
  settings: AppSettings;
  isLoading: boolean;
  error: string | null;

  // Internal: sequence number for optimistic concurrency control
  _updateSequence: number;

  // Actions
  setSettings: (settings: AppSettings) => void;
  updateSettings: (updates: Partial<AppSettings>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_APP_SETTINGS as AppSettings,
  isLoading: true,  // Start as true since we load settings on app init
  error: null,
  _updateSequence: 0,

  setSettings: (settings) => set({
    settings,
    _updateSequence: getNextSequence()
  }),

  updateSettings: (updates) =>
    set((state) => ({
      settings: { ...state.settings, ...updates },
      _updateSequence: getNextSequence()
    })),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error })
}));

/**
 * Check if settings need migration for onboardingCompleted flag.
 * Existing users (with tokens or projects configured) should have
 * onboardingCompleted set to true to skip the onboarding wizard.
 */
function migrateOnboardingCompleted(settings: AppSettings): AppSettings {
  // Only migrate if onboardingCompleted is undefined (not explicitly set)
  if (settings.onboardingCompleted !== undefined) {
    return settings;
  }

  // Check for signs of an existing user:
  // - Has a Claude OAuth token configured
  // - Has the auto-build source path configured
  const hasOAuthToken = Boolean(settings.globalClaudeOAuthToken);
  const hasAutoBuildPath = Boolean(settings.autoBuildPath);

  const isExistingUser = hasOAuthToken || hasAutoBuildPath;

  if (isExistingUser) {
    // Mark onboarding as completed for existing users
    return { ...settings, onboardingCompleted: true };
  }

  // New user - set to false to trigger onboarding wizard
  return { ...settings, onboardingCompleted: false };
}

/**
 * Load settings from main process
 */
export async function loadSettings(): Promise<void> {
  const store = useSettingsStore.getState();

  // Capture sequence at start to detect race conditions
  const startSequence = store._updateSequence;

  store.setLoading(true);

  try {
    const result = await window.electronAPI.getSettings();

    // Check sequence before updating settings
    const currentState = useSettingsStore.getState();
    if (currentState._updateSequence !== startSequence) {
      console.log('[SettingsStore] Race condition detected in loadSettings, aborting stale update');
      return;
    }

    if (result.success && result.data) {
      // Apply migration for onboardingCompleted flag
      const migratedSettings = migrateOnboardingCompleted(result.data);
      store.setSettings(migratedSettings);

      // If migration changed the settings, persist them
      if (migratedSettings.onboardingCompleted !== result.data.onboardingCompleted) {
        await window.electronAPI.saveSettings({
          onboardingCompleted: migratedSettings.onboardingCompleted
        });
      }
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Failed to load settings');
  } finally {
    store.setLoading(false);
  }
}

/**
 * Save settings to main process
 */
export async function saveSettings(updates: Partial<AppSettings>): Promise<boolean> {
  const store = useSettingsStore.getState();

  try {
    const result = await window.electronAPI.saveSettings(updates);
    if (result.success) {
      store.updateSettings(updates);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
