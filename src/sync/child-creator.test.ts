import { describe, it, expect, vi } from 'vitest';
import type { TaskMasterTask, TaskMasterSubtask } from '../schemas/taskmaster.js';
import {
  formatChildDescription,
  createChildren,
  createAllChildren,
} from './child-creator.js';

function createMockCli() {
  return {
    createEpic: vi.fn().mockResolvedValue({ id: 'epic-1', title: 'Test' }),
    createChild: vi.fn().mockResolvedValue({ id: 'child-1', title: 'Test' }),
    addDependency: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    checkInit: vi.fn().mockResolvedValue(true),
  } as any;
}

function createMockMapper() {
  const epics = new Map<number, string>();
  const subtasks = new Map<string, string>();
  const testIssues = new Map<number, string>();
  return {
    addEpic: vi.fn((tmId: number, beadsId: string) => epics.set(tmId, beadsId)),
    addSubtask: vi.fn((taskId: number, subId: number, beadsId: string) => subtasks.set(`${taskId}.${subId}`, beadsId)),
    getEpicId: vi.fn((tmId: number) => epics.get(tmId)),
    getSubtaskId: vi.fn((taskId: number, subId: number) => subtasks.get(`${taskId}.${subId}`)),
    setTestIssueId: vi.fn((tmId: number, beadsId: string) => testIssues.set(tmId, beadsId)),
    getTestIssueId: vi.fn((tmId: number) => testIssues.get(tmId)),
  } as any;
}

function makeSubtask(overrides: Partial<TaskMasterSubtask> = {}): TaskMasterSubtask {
  return {
    id: 1,
    title: 'Subtask one',
    description: 'Subtask description',
    status: 'pending',
    ...overrides,
  };
}

function makeTask(overrides: Partial<TaskMasterTask> = {}): TaskMasterTask {
  return {
    id: 1,
    title: 'Setup project',
    description: 'Initialize the project scaffolding',
    status: 'pending',
    priority: 'medium',
    dependencies: [],
    ...overrides,
  };
}

describe('formatChildDescription', () => {
  it('includes details when present', () => {
    const subtask = makeSubtask({
      description: 'Build the widget',
      details: 'Use React hooks for state management',
    });

    const result = formatChildDescription(subtask);

    expect(result).toContain('Build the widget');
    expect(result).toContain('## Implementation Details');
    expect(result).toContain('Use React hooks for state management');
  });

  it('omits details section when details is absent', () => {
    const subtask = makeSubtask({
      description: 'Simple subtask',
    });

    const result = formatChildDescription(subtask);

    expect(result).toBe('Simple subtask');
    expect(result).not.toContain('## Implementation Details');
  });

  it('omits details section when details is empty string', () => {
    const subtask = makeSubtask({
      description: 'Simple subtask',
      details: '',
    });

    const result = formatChildDescription(subtask);

    expect(result).toBe('Simple subtask');
    expect(result).not.toContain('## Implementation Details');
  });
});

describe('createChildren', () => {
  it('does nothing when subtasks is empty', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();
    const task = makeTask({ subtasks: [] });

    await createChildren(task, 'epic-1', cli, mapper);

    expect(cli.createChild).not.toHaveBeenCalled();
    expect(mapper.addSubtask).not.toHaveBeenCalled();
  });

  it('does nothing when subtasks is undefined', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();
    const task = makeTask({ subtasks: undefined });

    await createChildren(task, 'epic-1', cli, mapper);

    expect(cli.createChild).not.toHaveBeenCalled();
  });

  it('creates children sorted by subtask ID', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();

    let callOrder = 0;
    const titleOrder: string[] = [];
    cli.createChild.mockImplementation(async (_epicId: string, title: string) => {
      callOrder++;
      titleOrder.push(title);
      return { id: `child-${callOrder}`, title };
    });

    const task = makeTask({
      id: 10,
      subtasks: [
        makeSubtask({ id: 3, title: 'Third' }),
        makeSubtask({ id: 1, title: 'First' }),
        makeSubtask({ id: 2, title: 'Second' }),
      ],
    });

    await createChildren(task, 'epic-10', cli, mapper);

    expect(cli.createChild).toHaveBeenCalledTimes(3);
    expect(titleOrder).toEqual(['First', 'Second', 'Third']);

    expect(mapper.addSubtask).toHaveBeenCalledWith(10, 1, 'child-1');
    expect(mapper.addSubtask).toHaveBeenCalledWith(10, 2, 'child-2');
    expect(mapper.addSubtask).toHaveBeenCalledWith(10, 3, 'child-3');
  });
});

describe('createAllChildren', () => {
  it('tracks progress across all tasks', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();

    // Pre-populate epic mappings
    mapper.addEpic(1, 'epic-1');
    mapper.addEpic(2, 'epic-2');

    let childCount = 0;
    cli.createChild.mockImplementation(async () => {
      childCount++;
      return { id: `child-${childCount}`, title: 'Test' };
    });

    const tasks = [
      makeTask({
        id: 1,
        subtasks: [
          makeSubtask({ id: 1, title: 'Sub 1.1' }),
          makeSubtask({ id: 2, title: 'Sub 1.2' }),
        ],
      }),
      makeTask({
        id: 2,
        subtasks: [
          makeSubtask({ id: 1, title: 'Sub 2.1' }),
        ],
      }),
    ];

    const progressCalls: Array<[number, number]> = [];
    await createAllChildren(tasks, cli, mapper, (current, total) => {
      progressCalls.push([current, total]);
    });

    expect(cli.createChild).toHaveBeenCalledTimes(3);
    expect(progressCalls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('throws when epic ID is missing for a task', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();
    // Do NOT add epic mapping for task 1

    const tasks = [
      makeTask({
        id: 1,
        subtasks: [makeSubtask({ id: 1 })],
      }),
    ];

    await expect(createAllChildren(tasks, cli, mapper)).rejects.toThrow(
      'No epic mapping found for task 1',
    );
  });
});
