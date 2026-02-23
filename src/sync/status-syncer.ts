import type { TaskMasterTask } from '../schemas/taskmaster.js';
import type { BeadsCli } from '../beads/cli.js';
import type { IdMapper } from '../mapping/id-mapper.js';

export function mapStatus(tmStatus: string): { status?: string; close: boolean } {
  switch (tmStatus) {
    case 'pending':
      return { close: false };
    case 'in-progress':
      return { status: 'in_progress', close: false };
    case 'done':
      return { close: true };
    case 'deferred':
      return { status: 'deferred', close: false };
    default:
      return { close: false };
  }
}

export async function syncEpicStatus(
  task: TaskMasterTask,
  cli: BeadsCli,
  mapper: IdMapper,
): Promise<void> {
  const epicId = mapper.getEpicId(task.id);
  if (!epicId) {
    throw new Error(`No beads epic found for task ${task.id}`);
  }

  const mapped = mapStatus(task.status);

  if (mapped.close) {
    await cli.close(epicId);
  } else if (mapped.status) {
    await cli.updateStatus(epicId, mapped.status);
  }
  // pending and unknown statuses: no action
}

export async function syncSubtaskStatus(
  task: TaskMasterTask,
  cli: BeadsCli,
  mapper: IdMapper,
): Promise<void> {
  if (!task.subtasks) {
    return;
  }

  for (const subtask of task.subtasks) {
    const subtaskId = mapper.getSubtaskId(task.id, subtask.id);
    if (!subtaskId) {
      continue;
    }

    const mapped = mapStatus(subtask.status);

    if (mapped.close) {
      await cli.close(subtaskId);
    } else if (mapped.status) {
      await cli.updateStatus(subtaskId, mapped.status);
    }
  }
}

export async function syncAllStatuses(
  tasks: TaskMasterTask[],
  cli: BeadsCli,
  mapper: IdMapper,
): Promise<void> {
  for (const task of tasks) {
    await syncEpicStatus(task, cli, mapper);
    await syncSubtaskStatus(task, cli, mapper);
  }
}
