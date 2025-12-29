import { create } from 'zustand';
import type {
  InsightsSession,
  InsightsSessionSummary,
  InsightsChatMessage,
  InsightsChatStatus,
  InsightsStreamChunk,
  InsightsToolUsage,
  InsightsModelConfig,
  TaskMetadata,
  Task
} from '../../shared/types';

interface ToolUsage {
  name: string;
  input?: string;
}

interface StreamingState {
  content: string;
  currentTool: ToolUsage | null;
  toolsUsed: InsightsToolUsage[];
}

interface InsightsState {
  // Data - scoped by projectId
  sessionsByProject: Record<string, InsightsSession | null>;
  currentProjectId: string | null;
  sessions: InsightsSessionSummary[]; // List of all sessions for current project
  status: InsightsChatStatus;
  pendingMessage: string;
  streamingByProject: Record<string, StreamingState>; // Streaming state scoped by project
  isLoadingSessions: boolean;

  // Actions
  setSession: (projectId: string, session: InsightsSession | null) => void;
  getCurrentSession: (projectId: string) => InsightsSession | null;
  setSessions: (sessions: InsightsSessionSummary[]) => void;
  setStatus: (status: InsightsChatStatus) => void;
  setPendingMessage: (message: string) => void;
  addMessage: (projectId: string, message: InsightsChatMessage) => void;
  updateLastAssistantMessage: (projectId: string, content: string) => void;
  appendStreamingContent: (projectId: string, content: string) => void;
  clearStreamingContent: (projectId: string) => void;
  setCurrentTool: (projectId: string, tool: ToolUsage | null) => void;
  addToolUsage: (projectId: string, tool: ToolUsage) => void;
  clearToolsUsed: (projectId: string) => void;
  finalizeStreamingMessage: (projectId: string, suggestedTask?: InsightsChatMessage['suggestedTask']) => void;
  clearSession: (projectId: string) => void;
  setLoadingSessions: (loading: boolean) => void;
}

const initialStatus: InsightsChatStatus = {
  phase: 'idle',
  message: ''
};

const getEmptyStreamingState = (): StreamingState => ({
  content: '',
  currentTool: null,
  toolsUsed: []
});

export const useInsightsStore = create<InsightsState>((set, get) => ({
  // Initial state
  sessionsByProject: {},
  currentProjectId: null,
  sessions: [],
  status: initialStatus,
  pendingMessage: '',
  streamingByProject: {},
  isLoadingSessions: false,

  // Actions
  setSession: (projectId, session) =>
    set((state) => ({
      sessionsByProject: {
        ...state.sessionsByProject,
        [projectId]: session
      },
      currentProjectId: projectId
    })),

  getCurrentSession: (projectId) => {
    const state = get();
    return state.sessionsByProject[projectId] ?? null;
  },

  setSessions: (sessions) => set({ sessions }),

  setStatus: (status) => set({ status }),

  setLoadingSessions: (loading) => set({ isLoadingSessions: loading }),

  setPendingMessage: (message) => set({ pendingMessage: message }),

  addMessage: (projectId, message) =>
    set((state) => {
      // Layer 3: Validate projectId
      if (state.currentProjectId && state.currentProjectId !== projectId) {
        console.warn(`[InsightsStore] Rejecting addMessage for wrong project. Current: ${state.currentProjectId}, Attempted: ${projectId}`);
        return state;
      }

      const currentSession = state.sessionsByProject[projectId];

      if (!currentSession) {
        // Create new session if none exists
        const newSession: InsightsSession = {
          id: `session-${Date.now()}`,
          projectId,
          messages: [message],
          createdAt: new Date(),
          updatedAt: new Date()
        };
        return {
          sessionsByProject: {
            ...state.sessionsByProject,
            [projectId]: newSession
          },
          currentProjectId: projectId
        };
      }

      return {
        sessionsByProject: {
          ...state.sessionsByProject,
          [projectId]: {
            ...currentSession,
            messages: [...currentSession.messages, message],
            updatedAt: new Date()
          }
        }
      };
    }),

  updateLastAssistantMessage: (projectId, content) =>
    set((state) => {
      // Layer 3: Validate projectId
      if (state.currentProjectId && state.currentProjectId !== projectId) {
        console.warn(`[InsightsStore] Rejecting updateLastAssistantMessage for wrong project`);
        return state;
      }

      const currentSession = state.sessionsByProject[projectId];
      if (!currentSession || currentSession.messages.length === 0) return state;

      const messages = [...currentSession.messages];
      const lastIndex = messages.length - 1;
      const lastMessage = messages[lastIndex];

      if (lastMessage.role === 'assistant') {
        messages[lastIndex] = { ...lastMessage, content };
      }

      return {
        sessionsByProject: {
          ...state.sessionsByProject,
          [projectId]: {
            ...currentSession,
            messages,
            updatedAt: new Date()
          }
        }
      };
    }),

  appendStreamingContent: (projectId, content) =>
    set((state) => {
      // Layer 3: Validate projectId
      if (state.currentProjectId && state.currentProjectId !== projectId) {
        console.warn(`[InsightsStore] Rejecting appendStreamingContent for wrong project`);
        return state;
      }

      const currentStreaming = state.streamingByProject[projectId] ?? getEmptyStreamingState();
      return {
        streamingByProject: {
          ...state.streamingByProject,
          [projectId]: {
            ...currentStreaming,
            content: currentStreaming.content + content
          }
        }
      };
    }),

  clearStreamingContent: (projectId) =>
    set((state) => {
      const currentStreaming = state.streamingByProject[projectId];
      if (!currentStreaming) return state;

      return {
        streamingByProject: {
          ...state.streamingByProject,
          [projectId]: {
            ...currentStreaming,
            content: ''
          }
        }
      };
    }),

  setCurrentTool: (projectId, tool) =>
    set((state) => {
      const currentStreaming = state.streamingByProject[projectId] ?? getEmptyStreamingState();
      return {
        streamingByProject: {
          ...state.streamingByProject,
          [projectId]: {
            ...currentStreaming,
            currentTool: tool
          }
        }
      };
    }),

  addToolUsage: (projectId, tool) =>
    set((state) => {
      const currentStreaming = state.streamingByProject[projectId] ?? getEmptyStreamingState();
      return {
        streamingByProject: {
          ...state.streamingByProject,
          [projectId]: {
            ...currentStreaming,
            toolsUsed: [
              ...currentStreaming.toolsUsed,
              {
                name: tool.name,
                input: tool.input,
                timestamp: new Date()
              }
            ]
          }
        }
      };
    }),

  clearToolsUsed: (projectId) =>
    set((state) => {
      const currentStreaming = state.streamingByProject[projectId];
      if (!currentStreaming) return state;

      return {
        streamingByProject: {
          ...state.streamingByProject,
          [projectId]: {
            ...currentStreaming,
            toolsUsed: []
          }
        }
      };
    }),

  finalizeStreamingMessage: (projectId, suggestedTask) =>
    set((state) => {
      // Layer 3: Validate projectId
      if (state.currentProjectId && state.currentProjectId !== projectId) {
        console.warn(`[InsightsStore] Rejecting finalizeStreamingMessage for wrong project`);
        return state;
      }

      const currentStreaming = state.streamingByProject[projectId] ?? getEmptyStreamingState();
      const { content, toolsUsed } = currentStreaming;
      const toolsUsedArray = toolsUsed.length > 0 ? [...toolsUsed] : undefined;

      if (!content && !suggestedTask && !toolsUsedArray) {
        // Nothing to finalize, just clear streaming state
        return {
          streamingByProject: {
            ...state.streamingByProject,
            [projectId]: getEmptyStreamingState()
          }
        };
      }

      const newMessage: InsightsChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content,
        timestamp: new Date(),
        suggestedTask,
        toolsUsed: toolsUsedArray
      };

      const currentSession = state.sessionsByProject[projectId];

      if (!currentSession) {
        const newSession: InsightsSession = {
          id: `session-${Date.now()}`,
          projectId,
          messages: [newMessage],
          createdAt: new Date(),
          updatedAt: new Date()
        };
        return {
          streamingByProject: {
            ...state.streamingByProject,
            [projectId]: getEmptyStreamingState()
          },
          sessionsByProject: {
            ...state.sessionsByProject,
            [projectId]: newSession
          }
        };
      }

      return {
        streamingByProject: {
          ...state.streamingByProject,
          [projectId]: getEmptyStreamingState()
        },
        sessionsByProject: {
          ...state.sessionsByProject,
          [projectId]: {
            ...currentSession,
            messages: [...currentSession.messages, newMessage],
            updatedAt: new Date()
          }
        }
      };
    }),

  clearSession: (projectId) =>
    set((state) => ({
      sessionsByProject: {
        ...state.sessionsByProject,
        [projectId]: null
      },
      streamingByProject: {
        ...state.streamingByProject,
        [projectId]: getEmptyStreamingState()
      },
      status: initialStatus,
      pendingMessage: ''
    }))
}));

// Helper functions

export async function loadInsightsSessions(projectId: string): Promise<void> {
  const store = useInsightsStore.getState();
  store.setLoadingSessions(true);

  try {
    const result = await window.electronAPI.listInsightsSessions(projectId);
    if (result.success && result.data) {
      store.setSessions(result.data);
    } else {
      store.setSessions([]);
    }
  } finally {
    store.setLoadingSessions(false);
  }
}

export async function loadInsightsSession(projectId: string): Promise<void> {
  const result = await window.electronAPI.getInsightsSession(projectId);
  if (result.success && result.data) {
    useInsightsStore.getState().setSession(projectId, result.data);
  } else {
    useInsightsStore.getState().setSession(projectId, null);
  }
  // Also load the sessions list
  await loadInsightsSessions(projectId);
}

export function sendMessage(projectId: string, message: string, modelConfig?: InsightsModelConfig): void {
  const store = useInsightsStore.getState();
  const session = store.getCurrentSession(projectId);

  // Add user message to session
  const userMessage: InsightsChatMessage = {
    id: `msg-${Date.now()}`,
    role: 'user',
    content: message,
    timestamp: new Date()
  };
  store.addMessage(projectId, userMessage);

  // Clear pending and set status
  store.setPendingMessage('');
  store.clearStreamingContent(projectId);
  store.clearToolsUsed(projectId); // Clear tools from previous response
  store.setStatus({
    phase: 'thinking',
    message: 'Processing your message...'
  });

  // Use provided modelConfig, or fall back to session's config
  const configToUse = modelConfig || session?.modelConfig;

  // Send to main process
  window.electronAPI.sendInsightsMessage(projectId, message, configToUse);
}

export async function clearSession(projectId: string): Promise<void> {
  const result = await window.electronAPI.clearInsightsSession(projectId);
  if (result.success) {
    useInsightsStore.getState().clearSession(projectId);
    // Reload sessions list and current session
    await loadInsightsSession(projectId);
  }
}

export async function newSession(projectId: string): Promise<void> {
  const result = await window.electronAPI.newInsightsSession(projectId);
  if (result.success && result.data) {
    useInsightsStore.getState().setSession(projectId, result.data);
    // Reload sessions list
    await loadInsightsSessions(projectId);
  }
}

export async function switchSession(projectId: string, sessionId: string): Promise<void> {
  const result = await window.electronAPI.switchInsightsSession(projectId, sessionId);
  if (result.success && result.data) {
    useInsightsStore.getState().setSession(projectId, result.data);
    // Layer 2: Reset streaming state when switching sessions (atomic operation)
    useInsightsStore.getState().clearStreamingContent(projectId);
    useInsightsStore.getState().clearToolsUsed(projectId);
    useInsightsStore.getState().setCurrentTool(projectId, null);
    useInsightsStore.getState().setStatus({ phase: 'idle', message: '' });
  }
}

export async function deleteSession(projectId: string, sessionId: string): Promise<boolean> {
  const result = await window.electronAPI.deleteInsightsSession(projectId, sessionId);
  if (result.success) {
    // Reload sessions list and current session
    await loadInsightsSession(projectId);
    return true;
  }
  return false;
}

export async function renameSession(projectId: string, sessionId: string, newTitle: string): Promise<boolean> {
  const result = await window.electronAPI.renameInsightsSession(projectId, sessionId, newTitle);
  if (result.success) {
    // Reload sessions list to reflect the change
    await loadInsightsSessions(projectId);
    return true;
  }
  return false;
}

export async function updateModelConfig(projectId: string, sessionId: string, modelConfig: InsightsModelConfig): Promise<boolean> {
  const result = await window.electronAPI.updateInsightsModelConfig(projectId, sessionId, modelConfig);
  if (result.success) {
    // Update local session state
    const store = useInsightsStore.getState();
    const currentSession = store.getCurrentSession(projectId);
    if (currentSession?.id === sessionId) {
      store.setSession(projectId, {
        ...currentSession,
        modelConfig,
        updatedAt: new Date()
      });
    }
    // Reload sessions list to reflect the change
    await loadInsightsSessions(projectId);
    return true;
  }
  return false;
}

export async function createTaskFromSuggestion(
  projectId: string,
  title: string,
  description: string,
  metadata?: TaskMetadata
): Promise<Task | null> {
  const result = await window.electronAPI.createTaskFromInsights(
    projectId,
    title,
    description,
    metadata
  );

  if (result.success && result.data) {
    return result.data;
  }
  return null;
}

// IPC listener setup - call this once when the app initializes
export function setupInsightsListeners(): () => void {
  const store = useInsightsStore.getState;

  // Listen for streaming chunks
  const unsubStreamChunk = window.electronAPI.onInsightsStreamChunk(
    (projectId, chunk: InsightsStreamChunk) => {
      switch (chunk.type) {
        case 'text':
          if (chunk.content) {
            store().appendStreamingContent(projectId, chunk.content);
            store().setCurrentTool(projectId, null); // Clear tool when receiving text
            store().setStatus({
              phase: 'streaming',
              message: 'Receiving response...'
            });
          }
          break;
        case 'tool_start':
          if (chunk.tool) {
            store().setCurrentTool(projectId, {
              name: chunk.tool.name,
              input: chunk.tool.input
            });
            // Record this tool usage for history
            store().addToolUsage(projectId, {
              name: chunk.tool.name,
              input: chunk.tool.input
            });
            store().setStatus({
              phase: 'streaming',
              message: `Using ${chunk.tool.name}...`
            });
          }
          break;
        case 'tool_end':
          store().setCurrentTool(projectId, null);
          break;
        case 'task_suggestion':
          // Finalize the message with task suggestion
          store().setCurrentTool(projectId, null);
          store().finalizeStreamingMessage(projectId, chunk.suggestedTask);
          break;
        case 'done':
          // Finalize any remaining content
          store().setCurrentTool(projectId, null);
          store().finalizeStreamingMessage(projectId);
          store().setStatus({
            phase: 'complete',
            message: ''
          });
          break;
        case 'error':
          store().setCurrentTool(projectId, null);
          store().setStatus({
            phase: 'error',
            error: chunk.error
          });
          break;
      }
    }
  );

  // Listen for status updates
  const unsubStatus = window.electronAPI.onInsightsStatus((_projectId, status) => {
    store().setStatus(status);
  });

  // Listen for errors
  const unsubError = window.electronAPI.onInsightsError((_projectId, error) => {
    store().setStatus({
      phase: 'error',
      error
    });
  });

  // Return cleanup function
  return () => {
    unsubStreamChunk();
    unsubStatus();
    unsubError();
  };
}
