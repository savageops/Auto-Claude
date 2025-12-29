import type { Task, Project, TaskStatus } from '../../../shared/types';
import { projectStore } from '../../project-store';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { AUTO_BUILD_PATHS, getSpecsDir } from '../../../shared/constants';

/**
 * Helper function to find task and project by taskId
 */
export const findTaskAndProject = (taskId: string): { task: Task | undefined; project: Project | undefined } => {
  const projects = projectStore.getProjects();
  let task: Task | undefined;
  let project: Project | undefined;

  for (const p of projects) {
    const tasks = projectStore.getTasks(p.id);
    task = tasks.find((t) => t.id === taskId || t.specId === taskId);
    if (task) {
      project = p;
      break;
    }
  }

  return { task, project };
};

/**
 * Helper function to update task status in implementation_plan.json
 * Returns true if successful, false if file doesn't exist or update failed
 */
export const updateTaskStatusInPlan = (
  project: Project,
  task: Task,
  status: TaskStatus
): boolean => {
  try {
    const specsBaseDir = getSpecsDir(project.autoBuildPath);
    const specDir = path.join(project.path, specsBaseDir, task.specId);
    const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);

    if (!existsSync(planPath)) {
      return false;
    }

    const planContent = readFileSync(planPath, 'utf-8');
    const plan = JSON.parse(planContent);

    // Map UI status to plan status
    const planStatus = status === 'in_progress' ? 'in_progress'
      : status === 'ai_review' ? 'review'
      : status === 'human_review' ? 'review'
      : status === 'done' ? 'completed'
      : 'pending';

    plan.status = status;
    plan.planStatus = planStatus;
    plan.updated_at = new Date().toISOString();

    writeFileSync(planPath, JSON.stringify(plan, null, 2));
    return true;
  } catch (err) {
    console.error('[updateTaskStatusInPlan] Failed to update plan:', err);
    return false;
  }
};
