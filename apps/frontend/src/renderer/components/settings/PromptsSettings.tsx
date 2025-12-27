import { useState, useEffect } from 'react';
import { MessageSquare, Info, RotateCcw, ChevronDown, ChevronUp, GitMerge, Code, CheckSquare, FileText, Lightbulb, Map, Sparkles } from '@/lib/icons';
import { useTranslation } from 'react-i18next';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { SettingsSection } from './SettingsSection';
import { cn } from '../../lib/utils';
import { DEFAULT_APP_SETTINGS } from '../../../shared/constants';
import type { AppSettings, PromptConfig, MergePromptConfig, TaskExecutionPromptConfig } from '../../../shared/types';

export interface AdditionalPromptsData {
  ideationPrompts: Record<string, string>;
  roadmapDiscovery: string;
  roadmapFeatures: string;
  insightsPrompt: string;
}

interface PromptsSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onAdditionalPromptsReady?: (data: AdditionalPromptsData | null) => void;
}

/**
 * Prompts Configuration settings
 * Controls all AI prompts used throughout the application
 * Organized into collapsible sections: Merge, Task Execution, Ideation, Roadmap, Insights, Global
 */
export function PromptsSettings({ settings, onSettingsChange, onAdditionalPromptsReady }: PromptsSettingsProps) {
  const { t } = useTranslation('settings');

  // Get prompt config (with fallback to defaults)
  const promptConfig = settings.promptConfig ?? DEFAULT_APP_SETTINGS.promptConfig!;
  const mergeConfig = promptConfig.merge;
  const taskExecutionConfig = promptConfig.taskExecution;
  const globalInstructions = promptConfig.globalInstructions;

  // Section expansion state
  const [showMerge, setShowMerge] = useState(true);
  const [showTaskExecution, setShowTaskExecution] = useState(false);
  const [showIdeation, setShowIdeation] = useState(false);
  const [showRoadmap, setShowRoadmap] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [showGlobal, setShowGlobal] = useState(false);

  // Task execution sub-section expansion
  const [showPlanner, setShowPlanner] = useState(false);
  const [showCoder, setShowCoder] = useState(false);
  const [showQA, setShowQA] = useState(false);

  // Ideation prompts state
  const [ideationTypes, setIdeationTypes] = useState<Record<string, string>>({});
  const [ideationPrompts, setIdeationPrompts] = useState<Record<string, string>>({});
  const [ideationExpanded, setIdeationExpanded] = useState<Record<string, boolean>>({});

  // Roadmap prompts state
  const [roadmapDiscovery, setRoadmapDiscovery] = useState('');
  const [roadmapFeatures, setRoadmapFeatures] = useState('');
  const [showRoadmapDiscovery, setShowRoadmapDiscovery] = useState(false);
  const [showRoadmapFeatures, setShowRoadmapFeatures] = useState(false);

  // Insights prompt state
  const [insightsPrompt, setInsightsPrompt] = useState('');

  // Load base prompts from .md files when task execution is first opened
  const [basePromptsLoaded, setBasePromptsLoaded] = useState(false);
  useEffect(() => {
    if (showTaskExecution && !basePromptsLoaded) {
      // Load base prompts from backend
      const loadBasePrompts = async () => {
        try {
          const [plannerResult, coderResult, qaResult] = await Promise.all([
            window.electronAPI.readBasePrompt('planner'),
            window.electronAPI.readBasePrompt('coder'),
            window.electronAPI.readBasePrompt('qa')
          ]);

          const updates: Partial<TaskExecutionPromptConfig> = {};
          if (plannerResult.success && plannerResult.data) {
            updates.plannerBasePrompt = plannerResult.data;
          }
          if (coderResult.success && coderResult.data) {
            updates.coderBasePrompt = coderResult.data;
          }
          if (qaResult.success && qaResult.data) {
            updates.qaBasePrompt = qaResult.data;
          }

          // Update the settings if we loaded any prompts
          if (Object.keys(updates).length > 0) {
            const newPromptConfig: PromptConfig = {
              ...promptConfig,
              taskExecution: { ...taskExecutionConfig, ...updates }
            };
            onSettingsChange({ ...settings, promptConfig: newPromptConfig });
          }

          setBasePromptsLoaded(true);
        } catch (error) {
          console.error('Failed to load base prompts:', error);
          setBasePromptsLoaded(true); // Mark as loaded even on error to avoid infinite retries
        }
      };
      loadBasePrompts();
    }
  }, [showTaskExecution, basePromptsLoaded, promptConfig, taskExecutionConfig, settings, onSettingsChange]);

  // Load ideation types and prompts when ideation section is first opened
  const [ideationLoaded, setIdeationLoaded] = useState(false);
  useEffect(() => {
    if (showIdeation && !ideationLoaded) {
      const loadIdeation = async () => {
        try {
          // First get the list of available ideation types
          const typesResult = await window.electronAPI.listIdeationPrompts();
          if (typesResult.success && typesResult.data) {
            setIdeationTypes(typesResult.data);

            // Then load all the prompts
            const types = Object.keys(typesResult.data);
            const prompts: Record<string, string> = {};
            for (const type of types) {
              const result = await window.electronAPI.readIdeationPrompt(type);
              if (result.success && result.data) {
                prompts[type] = result.data;
              }
            }
            setIdeationPrompts(prompts);
          }
          setIdeationLoaded(true);
        } catch (error) {
          console.error('Failed to load ideation prompts:', error);
          setIdeationLoaded(true);
        }
      };
      loadIdeation();
    }
  }, [showIdeation, ideationLoaded]);

  // Load roadmap prompts when roadmap section is first opened
  const [roadmapLoaded, setRoadmapLoaded] = useState(false);
  useEffect(() => {
    if (showRoadmap && !roadmapLoaded) {
      const loadRoadmap = async () => {
        try {
          const [discoveryResult, featuresResult] = await Promise.all([
            window.electronAPI.readRoadmapPrompt('discovery'),
            window.electronAPI.readRoadmapPrompt('features')
          ]);
          if (discoveryResult.success && discoveryResult.data) {
            setRoadmapDiscovery(discoveryResult.data);
          }
          if (featuresResult.success && featuresResult.data) {
            setRoadmapFeatures(featuresResult.data);
          }
          setRoadmapLoaded(true);
        } catch (error) {
          console.error('Failed to load roadmap prompts:', error);
          setRoadmapLoaded(true);
        }
      };
      loadRoadmap();
    }
  }, [showRoadmap, roadmapLoaded]);

  // Load insights prompt when insights section is first opened
  const [insightsLoaded, setInsightsLoaded] = useState(false);
  useEffect(() => {
    if (showInsights && !insightsLoaded) {
      const loadInsights = async () => {
        try {
          const result = await window.electronAPI.readInsightsPrompt();
          if (result.success && result.data) {
            setInsightsPrompt(result.data);
          }
          setInsightsLoaded(true);
        } catch (error) {
          console.error('Failed to load insights prompt:', error);
          setInsightsLoaded(true);
        }
      };
      loadInsights();
    }
  }, [showInsights, insightsLoaded]);

  // Notify parent when additional prompts data changes
  useEffect(() => {
    if (onAdditionalPromptsReady) {
      onAdditionalPromptsReady({
        ideationPrompts,
        roadmapDiscovery,
        roadmapFeatures,
        insightsPrompt
      });
    }
  }, [ideationPrompts, roadmapDiscovery, roadmapFeatures, insightsPrompt, onAdditionalPromptsReady]);

  // Handler for merge config changes
  const handleMergeConfigChange = (updates: Partial<MergePromptConfig>) => {
    const newPromptConfig: PromptConfig = {
      ...promptConfig,
      merge: { ...mergeConfig, ...updates }
    };
    onSettingsChange({ ...settings, promptConfig: newPromptConfig });
  };

  // Handler for task execution config changes
  const handleTaskExecutionChange = (updates: Partial<TaskExecutionPromptConfig>) => {
    const newPromptConfig: PromptConfig = {
      ...promptConfig,
      taskExecution: { ...taskExecutionConfig, ...updates }
    };
    onSettingsChange({ ...settings, promptConfig: newPromptConfig });
  };

  // Handler for global instructions changes
  const handleGlobalInstructionsChange = (instructions: string | undefined) => {
    const newPromptConfig: PromptConfig = {
      ...promptConfig,
      globalInstructions: instructions
    };
    onSettingsChange({ ...settings, promptConfig: newPromptConfig });
  };

  // Reset to defaults
  const handleReset = () => {
    onSettingsChange({ ...settings, promptConfig: DEFAULT_APP_SETTINGS.promptConfig });
  };

  const hasChanges = JSON.stringify(promptConfig) !== JSON.stringify(DEFAULT_APP_SETTINGS.promptConfig);

  return (
    <SettingsSection
      title={t('sections.prompts.title')}
      description={t('sections.prompts.description')}
    >
      <div className="space-y-6">
        {/* Reset Button */}
        {hasChanges && (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-8 gap-2"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t('common:buttons.reset', 'Reset to defaults')}
            </Button>
          </div>
        )}

        {/* SECTION 1: Merge Prompts */}
        <div className="rounded-lg border border-border bg-card">
          <button
            onClick={() => setShowMerge(!showMerge)}
            className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <GitMerge className="h-5 w-5 text-primary" />
              <div className="text-left">
                <h3 className="text-sm font-semibold text-foreground">
                  {t('prompts.merge.title')}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t('prompts.merge.sectionDescription')}
                </p>
              </div>
            </div>
            {showMerge ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {showMerge && (
            <div className="px-4 pb-4 space-y-4 border-t border-border">
              {/* System Prompt */}
              <div className="space-y-3 pt-4">
                <Label htmlFor="systemPrompt" className="text-sm font-medium text-foreground">
                  {t('prompts.merge.systemPrompt.label')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('prompts.merge.systemPrompt.description')}
                </p>
                <Textarea
                  id="systemPrompt"
                  value={mergeConfig.systemPrompt}
                  onChange={(e) => handleMergeConfigChange({ systemPrompt: e.target.value })}
                  className="min-h-[100px] font-mono text-sm"
                  placeholder={DEFAULT_APP_SETTINGS.promptConfig!.merge.systemPrompt}
                />
              </div>

              {/* Critical Rules */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-1">
                    {t('prompts.merge.criticalRules.title')}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {t('prompts.merge.criticalRules.description')}
                  </p>
                </div>

                <div className="space-y-3 pl-4 border-l-2 border-primary/20">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="preventDeletion" className="text-sm font-medium cursor-pointer">
                        {t('prompts.merge.preventDeletion.label')}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t('prompts.merge.preventDeletion.description')}
                      </p>
                    </div>
                    <Switch
                      id="preventDeletion"
                      checked={mergeConfig.preventDeletion}
                      onCheckedChange={(checked) => handleMergeConfigChange({ preventDeletion: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="preventFeatureReduction" className="text-sm font-medium cursor-pointer">
                        {t('prompts.merge.preventFeatureReduction.label')}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t('prompts.merge.preventFeatureReduction.description')}
                      </p>
                    </div>
                    <Switch
                      id="preventFeatureReduction"
                      checked={mergeConfig.preventFeatureReduction}
                      onCheckedChange={(checked) => handleMergeConfigChange({ preventFeatureReduction: checked })}
                    />
                  </div>
                </div>
              </div>

              {/* Preservation Rules */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-1">
                    {t('prompts.merge.preservationRules.title')}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {t('prompts.merge.preservationRules.description')}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pl-4 border-l-2 border-primary/20">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="preserveAllImports" className="text-sm cursor-pointer">
                      {t('prompts.merge.preserveAllImports.label')}
                    </Label>
                    <Switch
                      id="preserveAllImports"
                      checked={mergeConfig.preserveAllImports}
                      onCheckedChange={(checked) => handleMergeConfigChange({ preserveAllImports: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="preserveAllHooks" className="text-sm cursor-pointer">
                      {t('prompts.merge.preserveAllHooks.label')}
                    </Label>
                    <Switch
                      id="preserveAllHooks"
                      checked={mergeConfig.preserveAllHooks}
                      onCheckedChange={(checked) => handleMergeConfigChange({ preserveAllHooks: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="preserveAllProps" className="text-sm cursor-pointer">
                      {t('prompts.merge.preserveAllProps.label')}
                    </Label>
                    <Switch
                      id="preserveAllProps"
                      checked={mergeConfig.preserveAllProps}
                      onCheckedChange={(checked) => handleMergeConfigChange({ preserveAllProps: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="preserveAllState" className="text-sm cursor-pointer">
                      {t('prompts.merge.preserveAllState.label')}
                    </Label>
                    <Switch
                      id="preserveAllState"
                      checked={mergeConfig.preserveAllState}
                      onCheckedChange={(checked) => handleMergeConfigChange({ preserveAllState: checked })}
                    />
                  </div>
                </div>
              </div>

              {/* Conflict Resolution Strategy */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-1">
                    {t('prompts.merge.conflictStrategy.title')}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {t('prompts.merge.conflictStrategy.description')}
                  </p>
                </div>

                <div className="space-y-3 pl-4 border-l-2 border-primary/20">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="combineConflicts" className="text-sm font-medium cursor-pointer">
                        {t('prompts.merge.combineConflicts.label')}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t('prompts.merge.combineConflicts.description')}
                      </p>
                    </div>
                    <Switch
                      id="combineConflicts"
                      checked={mergeConfig.combineConflicts}
                      onCheckedChange={(checked) => handleMergeConfigChange({ combineConflicts: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="includeMoreWhenUncertain" className="text-sm font-medium cursor-pointer">
                        {t('prompts.merge.includeMoreWhenUncertain.label')}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t('prompts.merge.includeMoreWhenUncertain.description')}
                      </p>
                    </div>
                    <Switch
                      id="includeMoreWhenUncertain"
                      checked={mergeConfig.includeMoreWhenUncertain}
                      onCheckedChange={(checked) => handleMergeConfigChange({ includeMoreWhenUncertain: checked })}
                    />
                  </div>
                </div>
              </div>

              {/* Custom Merge Instructions */}
              <div className="space-y-3">
                <Label htmlFor="customInstructions" className="text-sm font-medium text-foreground">
                  {t('prompts.merge.customInstructions.label')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('prompts.merge.customInstructions.description')}
                </p>
                <Textarea
                  id="customInstructions"
                  value={mergeConfig.customInstructions || ''}
                  onChange={(e) => handleMergeConfigChange({ customInstructions: e.target.value || undefined })}
                  className="min-h-[100px] font-mono text-sm"
                  placeholder={t('prompts.merge.customInstructions.placeholder')}
                />
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: Task Execution Prompts */}
        <div className="rounded-lg border border-border bg-card">
          <button
            onClick={() => setShowTaskExecution(!showTaskExecution)}
            className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Code className="h-5 w-5 text-primary" />
              <div className="text-left">
                <h3 className="text-sm font-semibold text-foreground">
                  {t('prompts.taskExecution.title')}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t('prompts.taskExecution.sectionDescription')}
                </p>
              </div>
            </div>
            {showTaskExecution ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {showTaskExecution && (
            <div className="border-t border-border">
              {/* Planner Sub-Section */}
              <div className="border-b border-border">
                <button
                  onClick={() => setShowPlanner(!showPlanner)}
                  className="w-full flex items-center justify-between p-4 pl-8 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-primary/80" />
                    <div className="text-left">
                      <h4 className="text-sm font-medium text-foreground">
                        {t('prompts.taskExecution.planner.title')}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {t('prompts.taskExecution.planner.subtitle')}
                      </p>
                    </div>
                  </div>
                  {showPlanner ? (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>

                {showPlanner && (
                  <div className="px-8 pb-4 space-y-4 bg-muted/20">
                    {/* Base Prompt */}
                    <div className="space-y-2">
                      <Label htmlFor="plannerBasePrompt" className="text-xs font-semibold text-foreground uppercase tracking-wide">
                        {t('prompts.taskExecution.basePrompt')}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t('prompts.taskExecution.basePromptDescription')}
                      </p>
                      <Textarea
                        id="plannerBasePrompt"
                        value={taskExecutionConfig.plannerBasePrompt || ''}
                        onChange={(e) => handleTaskExecutionChange({ plannerBasePrompt: e.target.value || undefined })}
                        className="min-h-[200px] font-mono text-xs"
                        placeholder={t('prompts.taskExecution.basePromptPlaceholder')}
                      />
                    </div>

                    {/* Additional Instructions */}
                    <div className="space-y-2">
                      <Label htmlFor="plannerInstructions" className="text-xs font-semibold text-foreground uppercase tracking-wide">
                        {t('prompts.taskExecution.additionalInstructions')}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t('prompts.taskExecution.planner.description')}
                      </p>
                      <Textarea
                        id="plannerInstructions"
                        value={taskExecutionConfig.plannerInstructions || ''}
                        onChange={(e) => handleTaskExecutionChange({ plannerInstructions: e.target.value || undefined })}
                        className="min-h-[80px] font-mono text-xs"
                        placeholder={t('prompts.taskExecution.planner.placeholder')}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Coder Sub-Section */}
              <div className="border-b border-border">
                <button
                  onClick={() => setShowCoder(!showCoder)}
                  className="w-full flex items-center justify-between p-4 pl-8 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-primary/80" />
                    <div className="text-left">
                      <h4 className="text-sm font-medium text-foreground">
                        {t('prompts.taskExecution.coder.title')}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {t('prompts.taskExecution.coder.subtitle')}
                      </p>
                    </div>
                  </div>
                  {showCoder ? (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>

                {showCoder && (
                  <div className="px-8 pb-4 space-y-4 bg-muted/20">
                    {/* Base Prompt */}
                    <div className="space-y-2">
                      <Label htmlFor="coderBasePrompt" className="text-xs font-semibold text-foreground uppercase tracking-wide">
                        {t('prompts.taskExecution.basePrompt')}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t('prompts.taskExecution.basePromptDescription')}
                      </p>
                      <Textarea
                        id="coderBasePrompt"
                        value={taskExecutionConfig.coderBasePrompt || ''}
                        onChange={(e) => handleTaskExecutionChange({ coderBasePrompt: e.target.value || undefined })}
                        className="min-h-[200px] font-mono text-xs"
                        placeholder={t('prompts.taskExecution.basePromptPlaceholder')}
                      />
                    </div>

                    {/* Additional Instructions */}
                    <div className="space-y-2">
                      <Label htmlFor="coderInstructions" className="text-xs font-semibold text-foreground uppercase tracking-wide">
                        {t('prompts.taskExecution.additionalInstructions')}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t('prompts.taskExecution.coder.description')}
                      </p>
                      <Textarea
                        id="coderInstructions"
                        value={taskExecutionConfig.coderInstructions || ''}
                        onChange={(e) => handleTaskExecutionChange({ coderInstructions: e.target.value || undefined })}
                        className="min-h-[80px] font-mono text-xs"
                        placeholder={t('prompts.taskExecution.coder.placeholder')}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* QA Sub-Section */}
              <div>
                <button
                  onClick={() => setShowQA(!showQA)}
                  className="w-full flex items-center justify-between p-4 pl-8 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <CheckSquare className="h-4 w-4 text-primary/80" />
                    <div className="text-left">
                      <h4 className="text-sm font-medium text-foreground">
                        {t('prompts.taskExecution.qa.title')}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {t('prompts.taskExecution.qa.subtitle')}
                      </p>
                    </div>
                  </div>
                  {showQA ? (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>

                {showQA && (
                  <div className="px-8 pb-4 space-y-4 bg-muted/20">
                    {/* Base Prompt */}
                    <div className="space-y-2">
                      <Label htmlFor="qaBasePrompt" className="text-xs font-semibold text-foreground uppercase tracking-wide">
                        {t('prompts.taskExecution.basePrompt')}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t('prompts.taskExecution.basePromptDescription')}
                      </p>
                      <Textarea
                        id="qaBasePrompt"
                        value={taskExecutionConfig.qaBasePrompt || ''}
                        onChange={(e) => handleTaskExecutionChange({ qaBasePrompt: e.target.value || undefined })}
                        className="min-h-[200px] font-mono text-xs"
                        placeholder={t('prompts.taskExecution.basePromptPlaceholder')}
                      />
                    </div>

                    {/* Additional Instructions */}
                    <div className="space-y-2">
                      <Label htmlFor="qaInstructions" className="text-xs font-semibold text-foreground uppercase tracking-wide">
                        {t('prompts.taskExecution.additionalInstructions')}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t('prompts.taskExecution.qa.description')}
                      </p>
                      <Textarea
                        id="qaInstructions"
                        value={taskExecutionConfig.qaInstructions || ''}
                        onChange={(e) => handleTaskExecutionChange({ qaInstructions: e.target.value || undefined })}
                        className="min-h-[80px] font-mono text-xs"
                        placeholder={t('prompts.taskExecution.qa.placeholder')}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* SECTION 3: Ideation Prompts */}
        <div className="rounded-lg border border-border bg-card">
          <button
            onClick={() => setShowIdeation(!showIdeation)}
            className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Lightbulb className="h-5 w-5 text-primary" />
              <div className="text-left">
                <h3 className="text-sm font-semibold text-foreground">
                  {t('prompts.ideation.title')}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t('prompts.ideation.sectionDescription')}
                </p>
              </div>
            </div>
            {showIdeation ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {showIdeation && (
            <div className="border-t border-border">
              {Object.entries(ideationTypes).map(([type, label]) => (
                <div key={type} className="border-b border-border last:border-b-0">
                  <button
                    onClick={() => setIdeationExpanded(prev => ({ ...prev, [type]: !prev[type] }))}
                    className="w-full flex items-center justify-between p-4 pl-8 hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Lightbulb className="h-4 w-4 text-primary/80" />
                      <div className="text-left">
                        <h4 className="text-sm font-medium text-foreground">{label}</h4>
                      </div>
                    </div>
                    {ideationExpanded[type] ? (
                      <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>

                  {ideationExpanded[type] && (
                    <div className="px-8 pb-4 space-y-2 bg-muted/20">
                      <Textarea
                        value={ideationPrompts[type] || ''}
                        onChange={(e) => {
                          setIdeationPrompts(prev => ({ ...prev, [type]: e.target.value }));
                        }}
                        className="min-h-[150px] font-mono text-xs"
                        placeholder={`Loading ${label.toLowerCase()} prompt...`}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SECTION 4: Roadmap Prompts */}
        <div className="rounded-lg border border-border bg-card">
          <button
            onClick={() => setShowRoadmap(!showRoadmap)}
            className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Map className="h-5 w-5 text-primary" />
              <div className="text-left">
                <h3 className="text-sm font-semibold text-foreground">
                  {t('prompts.roadmap.title')}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t('prompts.roadmap.sectionDescription')}
                </p>
              </div>
            </div>
            {showRoadmap ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {showRoadmap && (
            <div className="border-t border-border">
              {/* Discovery Sub-Section */}
              <div className="border-b border-border">
                <button
                  onClick={() => setShowRoadmapDiscovery(!showRoadmapDiscovery)}
                  className="w-full flex items-center justify-between p-4 pl-8 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Map className="h-4 w-4 text-primary/80" />
                    <div className="text-left">
                      <h4 className="text-sm font-medium text-foreground">
                        {t('prompts.roadmap.discovery')}
                      </h4>
                    </div>
                  </div>
                  {showRoadmapDiscovery ? (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>

                {showRoadmapDiscovery && (
                  <div className="px-8 pb-4 space-y-2 bg-muted/20">
                    <Textarea
                      value={roadmapDiscovery}
                      onChange={(e) => setRoadmapDiscovery(e.target.value)}
                      className="min-h-[150px] font-mono text-xs"
                      placeholder="Loading discovery roadmap prompt..."
                    />
                  </div>
                )}
              </div>

              {/* Features Sub-Section */}
              <div>
                <button
                  onClick={() => setShowRoadmapFeatures(!showRoadmapFeatures)}
                  className="w-full flex items-center justify-between p-4 pl-8 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Map className="h-4 w-4 text-primary/80" />
                    <div className="text-left">
                      <h4 className="text-sm font-medium text-foreground">
                        {t('prompts.roadmap.features')}
                      </h4>
                    </div>
                  </div>
                  {showRoadmapFeatures ? (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>

                {showRoadmapFeatures && (
                  <div className="px-8 pb-4 space-y-2 bg-muted/20">
                    <Textarea
                      value={roadmapFeatures}
                      onChange={(e) => setRoadmapFeatures(e.target.value)}
                      className="min-h-[150px] font-mono text-xs"
                      placeholder="Loading features roadmap prompt..."
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* SECTION 5: Insights Prompt */}
        <div className="rounded-lg border border-border bg-card">
          <button
            onClick={() => setShowInsights(!showInsights)}
            className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <div className="text-left">
                <h3 className="text-sm font-semibold text-foreground">
                  {t('prompts.insights.title')}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t('prompts.insights.sectionDescription')}
                </p>
              </div>
            </div>
            {showInsights ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {showInsights && (
            <div className="px-4 pb-4 space-y-2 border-t border-border pt-4">
              <Textarea
                value={insightsPrompt}
                onChange={(e) => setInsightsPrompt(e.target.value)}
                className="min-h-[150px] font-mono text-xs"
                placeholder="Loading insights prompt..."
              />
            </div>
          )}
        </div>

        {/* SECTION 6: Global Instructions */}
        <div className="rounded-lg border border-border bg-card">
          <button
            onClick={() => setShowGlobal(!showGlobal)}
            className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-primary" />
              <div className="text-left">
                <h3 className="text-sm font-semibold text-foreground">
                  {t('prompts.global.title')}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t('prompts.global.sectionDescription')}
                </p>
              </div>
            </div>
            {showGlobal ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {showGlobal && (
            <div className="px-4 pb-4 space-y-4 border-t border-border">
              <div className="space-y-3 pt-4">
                <Label htmlFor="globalInstructions" className="text-sm font-medium text-foreground">
                  {t('prompts.global.instructions.label')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('prompts.global.instructions.description')}
                </p>
                <Textarea
                  id="globalInstructions"
                  value={globalInstructions || ''}
                  onChange={(e) => handleGlobalInstructionsChange(e.target.value || undefined)}
                  className="min-h-[100px] font-mono text-sm"
                  placeholder={t('prompts.global.instructions.placeholder')}
                />
                <p className="text-xs text-muted-foreground italic">
                  {t('prompts.global.instructions.note')}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="font-medium text-foreground">
                {t('prompts.info.title')}
              </p>
              <p className="text-muted-foreground">
                {t('prompts.info.description')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
