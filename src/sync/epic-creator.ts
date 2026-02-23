import type { TaskMasterTask } from '../schemas/taskmaster.js';
import type { BeadsCli } from '../beads/cli.js';
import type { IdMapper } from '../mapping/id-mapper.js';

export function formatEpicDescription(task: TaskMasterTask): string {
  const parts: string[] = [];

  parts.push(`## Description\n\n${task.description}`);

  if (task.details) {
    parts.push(`## Implementation Details\n\n${task.details}`);
  }

  if (task.testStrategy) {
    parts.push(`## Test Strategy\n\n${task.testStrategy}`);
  }

  const metadataLines: string[] = [
    `- **Task-Master ID:** ${task.id}`,
  ];
  if (task.complexity !== undefined) {
    metadataLines.push(`- **Complexity:** ${task.complexity}/10`);
  }
  metadataLines.push(`- **Original Status:** ${task.status}`);

  parts.push(`## Metadata\n\n${metadataLines.join('\n')}`);

  return parts.join('\n\n');
}

export function mapPriority(tmPriority: 'high' | 'medium' | 'low'): number {
  switch (tmPriority) {
    case 'high':
      return 0;
    case 'medium':
      return 1;
    case 'low':
      return 2;
  }
}

export async function createEpic(
  task: TaskMasterTask,
  cli: BeadsCli,
  mapper: IdMapper,
): Promise<string> {
  const description = formatEpicDescription(task);
  const priority = mapPriority(task.priority);
  const result = await cli.createEpic(task.title, description, priority);
  mapper.addEpic(task.id, result.id);
  return result.id;
}

export async function createEpics(
  tasks: TaskMasterTask[],
  cli: BeadsCli,
  mapper: IdMapper,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  const total = tasks.length;
  for (let i = 0; i < total; i++) {
    await createEpic(tasks[i], cli, mapper);
    onProgress?.(i + 1, total);
  }
}
