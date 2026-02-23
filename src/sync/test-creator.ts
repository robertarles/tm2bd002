import type { TaskMasterTask } from '../schemas/taskmaster.js';
import { BeadsCli } from '../beads/cli.js';
import { IdMapper } from '../mapping/id-mapper.js';

function formatTestDescription(testStrategy: string): string {
  return ['## Test Strategy', testStrategy].join('\n');
}

export async function createTestChild(
  task: TaskMasterTask,
  epicId: string,
  cli: BeadsCli,
  mapper: IdMapper,
): Promise<string | null> {
  if (!task.testStrategy) return null;
  const title = `Test: ${task.title}`;
  const description = formatTestDescription(task.testStrategy);
  const result = await cli.createChild(epicId, title, description);
  mapper.setTestIssueId(task.id, result.id);
  return result.id;
}

export async function createAllTestChildren(
  tasks: TaskMasterTask[],
  cli: BeadsCli,
  mapper: IdMapper,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  const tasksWithTests = tasks.filter(t => t.testStrategy);
  for (let i = 0; i < tasksWithTests.length; i++) {
    const task = tasksWithTests[i];
    const epicId = mapper.getEpicId(task.id);
    if (!epicId) throw new Error(`Epic ID not found for task ${task.id}`);
    await createTestChild(task, epicId, cli, mapper);
    onProgress?.(i + 1, tasksWithTests.length);
  }
}

export { formatTestDescription };
