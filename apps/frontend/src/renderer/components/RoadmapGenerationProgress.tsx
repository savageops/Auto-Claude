import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Users, Sparkles, CheckCircle2, AlertCircle, Square } from '@/lib/icons';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { cn } from '../lib/utils';
import type { RoadmapGenerationStatus } from '../../shared/types/roadmap';

/**
 * Hook to detect user's reduced motion preference.
 * Listens for changes to the prefers-reduced-motion media query.
 */
function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() => {
    // Check if window is available (for SSR safety)
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };

    // Add listener for changes
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return reducedMotion;
}

interface RoadmapGenerationProgressProps {
  generationStatus: RoadmapGenerationStatus;
  className?: string;
  onStop?: () => void | Promise<void>;
}

// Type for generation phases (excluding idle)
type GenerationPhase = Exclude<RoadmapGenerationStatus['phase'], 'idle'>;

// Phase display configuration - monochromatic topographic color scheme
const PHASE_CONFIG: Record<
  GenerationPhase,
  {
    label: string;
    description: string;
    icon: typeof Search;
    color: string;
    bgColor: string;
    opacity: number;
  }
> = {
  analyzing: {
    label: 'Analyzing',
    description: 'Analyzing project structure and codebase...',
    icon: Search,
    color: 'bg-primary',
    bgColor: 'bg-muted',
    opacity: 0.7,
  },
  discovering: {
    label: 'Discovering',
    description: 'Discovering target audience and user needs...',
    icon: Users,
    color: 'bg-primary',
    bgColor: 'bg-muted',
    opacity: 0.8,
  },
  generating: {
    label: 'Generating',
    description: 'Generating feature roadmap...',
    icon: Sparkles,
    color: 'bg-primary',
    bgColor: 'bg-muted',
    opacity: 1,
  },
  complete: {
    label: 'Complete',
    description: 'Roadmap generation complete!',
    icon: CheckCircle2,
    color: 'bg-success',
    bgColor: 'bg-muted',
    opacity: 1,
  },
  error: {
    label: 'Error',
    description: 'Generation failed',
    icon: AlertCircle,
    color: 'bg-destructive',
    bgColor: 'bg-muted',
    opacity: 1,
  },
};

// Phases shown in the step indicator (excluding complete and error)
const STEP_PHASES: { key: GenerationPhase; label: string }[] = [
  { key: 'analyzing', label: 'Analyze' },
  { key: 'discovering', label: 'Discover' },
  { key: 'generating', label: 'Generate' },
];

/**
 * Internal component for showing phase steps indicator
 */
function PhaseStepsIndicator({
  currentPhase,
  reducedMotion,
}: {
  currentPhase: RoadmapGenerationStatus['phase'];
  reducedMotion: boolean;
}) {
  const getPhaseState = (
    phaseKey: GenerationPhase
  ): 'pending' | 'active' | 'complete' | 'error' => {
    const phaseOrder: GenerationPhase[] = ['analyzing', 'discovering', 'generating', 'complete'];
    const currentIndex = phaseOrder.indexOf(currentPhase as GenerationPhase);
    const phaseIndex = phaseOrder.indexOf(phaseKey);

    if (currentPhase === 'error') return 'error';
    if (currentPhase === 'complete') return 'complete';
    if (phaseKey === currentPhase) return 'active';
    if (phaseIndex < currentIndex) return 'complete';
    return 'pending';
  };

  // Animation values that respect reduced motion preference
  const getStepAnimation = (state: string) => {
    if (state !== 'active') return { opacity: 1 };
    return reducedMotion ? { opacity: 1 } : { opacity: [1, 0.6, 1] };
  };

  const getStepTransition = (state: string) => {
    if (state !== 'active' || reducedMotion) return undefined;
    return { duration: 1.5, repeat: Infinity, ease: 'easeInOut' as const };
  };

  return (
    <div className="flex items-center justify-center gap-0.5 mt-2">
      {STEP_PHASES.map((phase, index) => {
        const state = getPhaseState(phase.key);
        return (
          <div key={phase.key} className="flex items-center">
            <motion.div
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                state === 'complete' && 'bg-muted text-primary',
                state === 'active' && 'bg-muted text-primary',
                state === 'error' && 'bg-muted text-destructive',
                state === 'pending' && 'bg-secondary text-muted-foreground'
              )}
              animate={getStepAnimation(state)}
              transition={getStepTransition(state)}
            >
              {state === 'complete' && (
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
              {phase.label}
            </motion.div>
            {index < STEP_PHASES.length - 1 && (
              <div
                className={cn(
                  'w-2 h-px mx-0.5 transition-colors',
                  getPhaseState(STEP_PHASES[index + 1].key) !== 'pending'
                    ? 'bg-primary/30'
                    : 'bg-muted'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Animated progress component for roadmap generation.
 * Displays the current generation phase with animated transitions,
 * progress visualization, and step indicators.
 */
export function RoadmapGenerationProgress({
  generationStatus,
  className,
  onStop
}: RoadmapGenerationProgressProps) {
  const { phase, progress, message, error } = generationStatus;
  const reducedMotion = useReducedMotion();
  const [isStopping, setIsStopping] = useState(false);

  // Filter out debug text like "[Tool: Read]" from message
  const cleanMessage = message?.replace(/\[Tool:.*?\]\s*/g, '').trim();

  /**
   * Handle stop button click with error handling and double-click prevention
   */
  const handleStopClick = async () => {
    if (!onStop || isStopping) return;

    setIsStopping(true);
    try {
      await onStop();
    } catch (err) {
      console.error('Failed to stop generation:', err);
    } finally {
      setIsStopping(false);
    }
  };

  // Don't render anything for idle phase
  if (phase === 'idle') {
    return null;
  }

  const config = PHASE_CONFIG[phase];
  const Icon = config.icon;
  const isActivePhase = phase !== 'complete' && phase !== 'error';

  // Animation values that respect reduced motion preference
  const pulseAnimation = reducedMotion
    ? {}
    : {
        scale: [1, 1.1, 1],
        opacity: [1, 0.8, 1],
      };

  const pulseTransition = reducedMotion
    ? { duration: 0 }
    : {
        duration: 1.5,
        repeat: isActivePhase ? Infinity : 0,
        ease: 'easeInOut' as const,
      };

  const dotAnimation = reducedMotion
    ? { scale: 1, opacity: 1 }
    : {
        scale: [1, 1.5, 1],
        opacity: [1, 0.5, 1],
      };

  const dotTransition = reducedMotion
    ? { duration: 0 }
    : {
        duration: 1,
        repeat: Infinity,
        ease: 'easeInOut' as const,
      };

  const indeterminateAnimation = reducedMotion
    ? { x: '150%' }
    : { x: ['-100%', '400%'] };

  const indeterminateTransition = reducedMotion
    ? { duration: 0 }
    : {
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut' as const,
      };

  return (
    <div className={cn('max-w-lg mx-auto space-y-2.5 p-4 rounded-lg bg-card/80 backdrop-blur-sm', className)}>
      {/* Header with Stop button */}
      {isActivePhase && onStop && (
        <div className="flex justify-end -mt-1 mb-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStopClick}
                disabled={isStopping}
              >
                <Square className="h-4 w-4 mr-1" />
                {isStopping ? 'Stopping...' : 'Stop'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Stop generation</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Main phase display */}
      <div className="flex flex-col items-center text-center space-y-2">
        {/* Animated icon with pulsing animation for active phase */}
        <div className="relative">
          <motion.div
            className={cn('p-2.5 rounded-md', config.bgColor)}
            animate={isActivePhase ? pulseAnimation : {}}
            transition={pulseTransition}
            style={{ opacity: config.opacity }}
          >
            <Icon className={cn('h-8 w-8', config.color.replace('bg-', 'text-'))} />
          </motion.div>
          {/* Pulsing activity indicator dot for active phase */}
          {isActivePhase && (
            <motion.div
              className={cn('absolute top-0 right-0 h-2 w-2 rounded-full', config.color)}
              animate={dotAnimation}
              transition={dotTransition}
            />
          )}
        </div>

        {/* Phase label and description */}
        <AnimatePresence mode="wait">
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-1"
          >
            <h3 className="text-lg font-semibold tracking-tight">{config.label}</h3>
            <p className="text-sm text-muted-foreground/80 leading-relaxed">{config.description}</p>
            {cleanMessage && cleanMessage !== config.description && (
              <p className="text-xs text-muted-foreground/70 mt-1 leading-relaxed">{cleanMessage}</p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress bar */}
      {isActivePhase && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground/70">Progress</span>
            <span className="text-xs font-medium tabular-nums">{progress}%</span>
          </div>
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
            {progress > 0 ? (
              // Determinate progress bar
              <motion.div
                className={cn('h-full rounded-sm', config.color)}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                style={{ opacity: config.opacity }}
              />
            ) : (
              // Indeterminate progress bar when progress is 0
              <motion.div
                className={cn('absolute h-full w-1/3 rounded-sm', config.color)}
                animate={indeterminateAnimation}
                transition={indeterminateTransition}
                style={{ opacity: config.opacity * 0.8 }}
              />
            )}
          </div>
        </div>
      )}

      {/* Phase steps indicator */}
      <PhaseStepsIndicator currentPhase={phase} reducedMotion={reducedMotion} />

      {/* Error display - shows whenever error is present, regardless of phase */}
      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            key="error-display"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="p-2.5 bg-muted rounded-md"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive/90 leading-relaxed">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
