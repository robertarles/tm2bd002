/**
 * Topological sort with tier assignment for dependency-ordered task processing.
 *
 * Uses DFS with cycle detection to produce a deterministic ordering
 * sorted by tier (ascending) then task id (ascending).
 */

interface TaskForSort {
  id: number;
  dependencies: number[];
}

export interface SortedTask<T extends TaskForSort = TaskForSort> {
  task: T;
  tier: number;
}

/**
 * Performs a topological sort on tasks, assigning each a tier based on its
 * maximum dependency depth. Tasks with no dependencies are tier 0.
 *
 * @throws Error if a circular dependency is detected
 * @throws Error if a dependency references a task that does not exist
 */
export function topologicalSort<T extends TaskForSort>(
  tasks: T[],
): SortedTask<T>[] {
  const taskMap = new Map<number, T>();
  for (const task of tasks) {
    taskMap.set(task.id, task);
  }

  const visiting = new Set<number>();
  const visited = new Set<number>();
  const tiers = new Map<number, number>();

  function visit(id: number): number {
    if (visited.has(id)) {
      return tiers.get(id)!;
    }

    if (visiting.has(id)) {
      throw new Error(`Circular dependency detected involving task ${id}`);
    }

    const task = taskMap.get(id);
    if (task === undefined) {
      throw new Error(`Task ${id} referenced but not found`);
    }

    visiting.add(id);

    let maxDepTier = -1;
    for (const depId of task.dependencies) {
      if (depId === id) {
        throw new Error(`Circular dependency detected involving task ${id}`);
      }
      const depTier = visit(depId);
      if (depTier > maxDepTier) {
        maxDepTier = depTier;
      }
    }

    visiting.delete(id);
    visited.add(id);

    const tier = maxDepTier + 1;
    tiers.set(id, tier);
    return tier;
  }

  // Process all tasks to handle disconnected components
  for (const task of tasks) {
    if (!visited.has(task.id)) {
      visit(task.id);
    }
  }

  const result: SortedTask<T>[] = tasks.map((task) => ({
    task,
    tier: tiers.get(task.id)!,
  }));

  // Deterministic ordering: tier ascending, then id ascending
  result.sort((a, b) => {
    if (a.tier !== b.tier) {
      return a.tier - b.tier;
    }
    return a.task.id - b.task.id;
  });

  return result;
}
