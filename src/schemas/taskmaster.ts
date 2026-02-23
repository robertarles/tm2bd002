import { z } from 'zod';

// --- Enum Schemas ---

export const TaskMasterStatusSchema = z.enum([
  'pending',
  'in-progress',
  'done',
  'deferred',
]);

export const TaskMasterPrioritySchema = z.enum(['high', 'medium', 'low']);

// --- Object Schemas ---

export const TaskMasterSubtaskSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  status: TaskMasterStatusSchema,
  dependencies: z.array(z.number()).optional(),
  details: z.string().optional(),
});

export const TaskMasterTaskSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  status: TaskMasterStatusSchema,
  priority: TaskMasterPrioritySchema,
  dependencies: z.array(z.number()),
  complexity: z.number().min(1).max(10).optional(),
  subtasks: z.array(TaskMasterSubtaskSchema).optional(),
  details: z.string().optional(),
  testStrategy: z.string().optional(),
});

export const TaskMasterProjectSchema = z.object({
  tasks: z.array(TaskMasterTaskSchema),
});

// --- Inferred Types ---

export type TaskMasterSubtask = z.infer<typeof TaskMasterSubtaskSchema>;
export type TaskMasterTask = z.infer<typeof TaskMasterTaskSchema>;
export type TaskMasterProject = z.infer<typeof TaskMasterProjectSchema>;

// --- Dependency Validation Helpers ---

/**
 * Detects circular dependencies among tasks using DFS cycle detection.
 * Returns { valid: true, errors: [] } if no cycles are found.
 * Returns { valid: false, errors: [...] } with descriptive cycle paths if cycles exist.
 */
export function validateCircularDependencies(
  tasks: TaskMasterTask[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Build adjacency list: task id -> list of dependency ids
  const adjacency = new Map<number, number[]>();
  for (const task of tasks) {
    adjacency.set(task.id, task.dependencies);
  }

  const visited = new Set<number>();
  const visiting = new Set<number>();

  function dfs(taskId: number, path: number[]): boolean {
    if (visiting.has(taskId)) {
      // Found a cycle — extract the cycle portion from the path
      const cycleStart = path.indexOf(taskId);
      const cyclePath = [...path.slice(cycleStart), taskId];
      errors.push(`Circular dependency: ${cyclePath.join(' \u2192 ')}`);
      return true;
    }

    if (visited.has(taskId)) {
      return false;
    }

    visiting.add(taskId);
    path.push(taskId);

    const deps = adjacency.get(taskId) ?? [];
    for (const depId of deps) {
      if (dfs(depId, path)) {
        // Continue checking other branches to report all cycles
      }
    }

    path.pop();
    visiting.delete(taskId);
    visited.add(taskId);

    return false;
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      dfs(task.id, []);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates that all dependency references in tasks point to existing task IDs.
 * Returns { valid: true, errors: [] } if all dependency IDs are valid.
 * Returns { valid: false, errors: [...] } listing each invalid reference.
 */
export function validateDependencyIds(
  tasks: TaskMasterTask[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const validIds = new Set<number>(tasks.map((t) => t.id));

  for (const task of tasks) {
    for (const depId of task.dependencies) {
      if (!validIds.has(depId)) {
        errors.push(`Task ${task.id} depends on non-existent task ${depId}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
