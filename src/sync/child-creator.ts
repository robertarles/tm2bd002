import type { TaskMasterTask, TaskMasterSubtask } from '../schemas/taskmaster.js';
import type { BeadsCli } from '../beads/cli.js';
import type { IdMapper } from '../mapping/id-mapper.js';

export function formatChildDescription(subtask: TaskMasterSubtask): string {
  const parts: string[] = [subtask.description];

  if (subtask.details && subtask.details.length > 0) {
    parts.push('');
    parts.push('## Implementation Details');
    parts.push(subtask.details);
  }

  return parts.join('\n');
}

export async function createChildren(
  task: TaskMasterTask,
  epicId: string,
  cli: BeadsCli,
  mapper: IdMapper,
): Promise<void> {
  if (!task.subtasks || task.subtasks.length === 0) {
    return;
  }

  const sorted = [...task.subtasks].sort((a, b) => a.id - b.id);

  for (const subtask of sorted) {
    const description = formatChildDescription(subtask);
    const result = await cli.createChild(epicId, subtask.title, description);
    mapper.addSubtask(task.id, subtask.id, result.id);
  }
}

export async function createAllChildren(
  tasks: TaskMasterTask[],
  cli: BeadsCli,
  mapper: IdMapper,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  const total = tasks.reduce(
    (sum, t) => sum + (t.subtasks?.length ?? 0),
    0,
  );

  let current = 0;

  for (const task of tasks) {
    const epicId = mapper.getEpicId(task.id);
    if (epicId === undefined) {
      throw new Error(`No epic mapping found for task ${task.id}`);
    }

    if (task.subtasks && task.subtasks.length > 0) {
      const sorted = [...task.subtasks].sort((a, b) => a.id - b.id);

      for (const subtask of sorted) {
        const description = formatChildDescription(subtask);
        const result = await cli.createChild(epicId, subtask.title, description);
        mapper.addSubtask(task.id, subtask.id, result.id);
        current++;
        onProgress?.(current, total);
      }
    }
  }
}
