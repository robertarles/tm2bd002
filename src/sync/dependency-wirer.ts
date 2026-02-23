import type { TaskMasterTask } from '../schemas/taskmaster.js';
import type { BeadsCli } from '../beads/cli.js';
import { IdMapper } from '../mapping/id-mapper.js';

/**
 * Wire epic-level dependencies.
 * For each task that has dependencies, resolve both the blocked and blocking
 * Beads IDs via the mapper and register the dependency through the CLI.
 */
export async function wireEpicDependencies(
  tasks: TaskMasterTask[],
  cli: BeadsCli,
  mapper: IdMapper,
): Promise<void> {
  for (const task of tasks) {
    if (task.dependencies.length === 0) {
      continue;
    }

    const blockedEpicId = mapper.getEpicId(task.id);
    if (blockedEpicId === undefined) {
      throw new Error(
        `Failed to wire epic dependency: no Beads ID found for blocked task ${task.id} ("${task.title}")`,
      );
    }

    for (const depTmId of task.dependencies) {
      const blockingEpicId = mapper.getEpicId(depTmId);
      if (blockingEpicId === undefined) {
        throw new Error(
          `Failed to wire epic dependency: no Beads ID found for blocking task ${depTmId} (dependency of task ${task.id} "${task.title}")`,
        );
      }

      await cli.addDependency(blockedEpicId, blockingEpicId);
    }
  }
}

/**
 * Wire subtask-level dependencies within each parent task.
 * For each subtask that declares dependencies, resolve both the blocked and
 * blocking Beads IDs (scoped to the same parent) and register the dependency.
 */
export async function wireSubtaskDependencies(
  tasks: TaskMasterTask[],
  cli: BeadsCli,
  mapper: IdMapper,
): Promise<void> {
  for (const task of tasks) {
    const subtasks = task.subtasks;
    if (!subtasks || subtasks.length === 0) {
      continue;
    }

    for (const subtask of subtasks) {
      const deps = subtask.dependencies;
      if (!deps || deps.length === 0) {
        continue;
      }

      const blockedSubtaskId = mapper.getSubtaskId(task.id, subtask.id);
      if (blockedSubtaskId === undefined) {
        throw new Error(
          `Failed to wire subtask dependency: no Beads ID found for blocked subtask ${subtask.id} ("${subtask.title}") of task ${task.id} ("${task.title}")`,
        );
      }

      for (const depSubtaskTmId of deps) {
        const blockingSubtaskId = mapper.getSubtaskId(task.id, depSubtaskTmId);
        if (blockingSubtaskId === undefined) {
          throw new Error(
            `Failed to wire subtask dependency: no Beads ID found for blocking subtask ${depSubtaskTmId} (dependency of subtask ${subtask.id} "${subtask.title}" in task ${task.id} "${task.title}")`,
          );
        }

        await cli.addDependency(blockedSubtaskId, blockingSubtaskId);
      }
    }
  }
}

/**
 * Wire test issue dependencies.
 * For each task that has a test issue and subtasks, make the test issue
 * depend on all subtasks so it runs after implementation is complete.
 */
export async function wireTestDependencies(
  tasks: TaskMasterTask[],
  cli: BeadsCli,
  mapper: IdMapper,
): Promise<number> {
  let count = 0;
  for (const task of tasks) {
    if (!task.subtasks || task.subtasks.length === 0) continue;
    const testIssueId = mapper.getTestIssueId(task.id);
    if (!testIssueId) continue;
    for (const subtask of task.subtasks) {
      const subtaskBeadsId = mapper.getSubtaskId(task.id, subtask.id);
      if (!subtaskBeadsId) throw new Error(`Subtask ID not found for ${task.id}.${subtask.id}`);
      await cli.addDependency(testIssueId, subtaskBeadsId);
      count++;
    }
  }
  return count;
}

/**
 * Wire all dependencies: first epic-level, then subtask-level, then test dependencies.
 */
export async function wireAllDependencies(
  tasks: TaskMasterTask[],
  cli: BeadsCli,
  mapper: IdMapper,
): Promise<void> {
  await wireEpicDependencies(tasks, cli, mapper);
  await wireSubtaskDependencies(tasks, cli, mapper);
  await wireTestDependencies(tasks, cli, mapper);
}
