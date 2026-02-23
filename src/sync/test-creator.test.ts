import { describe, it, expect, vi } from 'vitest';
import type { TaskMasterTask } from '../schemas/taskmaster.js';
import {
  formatTestDescription,
  createTestChild,
  createAllTestChildren,
} from './test-creator.js';

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

describe('formatTestDescription', () => {
  it('formats test strategy with heading', () => {
    const result = formatTestDescription('Run unit tests with jest');

    expect(result).toBe('## Test Strategy\nRun unit tests with jest');
  });
});

describe('createTestChild', () => {
  it('creates a test child when testStrategy is present', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();

    cli.createChild.mockResolvedValue({ id: 'test-child-1', title: 'Test: Setup project' });

    const task = makeTask({
      id: 5,
      title: 'Setup project',
      testStrategy: 'Unit tests for all modules',
    });

    const result = await createTestChild(task, 'epic-5', cli, mapper);

    expect(result).toBe('test-child-1');
    expect(cli.createChild).toHaveBeenCalledWith(
      'epic-5',
      'Test: Setup project',
      '## Test Strategy\nUnit tests for all modules',
    );
    expect(mapper.setTestIssueId).toHaveBeenCalledWith(5, 'test-child-1');
  });

  it('returns null when testStrategy is absent', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();

    const task = makeTask({ id: 5, testStrategy: undefined });

    const result = await createTestChild(task, 'epic-5', cli, mapper);

    expect(result).toBeNull();
    expect(cli.createChild).not.toHaveBeenCalled();
    expect(mapper.setTestIssueId).not.toHaveBeenCalled();
  });
});

describe('createAllTestChildren', () => {
  it('filters tasks and creates test children only for those with testStrategy', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();

    mapper.addEpic(1, 'epic-1');
    mapper.addEpic(2, 'epic-2');
    mapper.addEpic(3, 'epic-3');

    let callCount = 0;
    cli.createChild.mockImplementation(async () => {
      callCount++;
      return { id: `test-child-${callCount}`, title: 'Test' };
    });

    const tasks = [
      makeTask({ id: 1, title: 'Task 1', testStrategy: 'Test plan A' }),
      makeTask({ id: 2, title: 'Task 2' }), // no testStrategy
      makeTask({ id: 3, title: 'Task 3', testStrategy: 'Test plan C' }),
    ];

    const progressCalls: Array<[number, number]> = [];
    await createAllTestChildren(tasks, cli, mapper, (current, total) => {
      progressCalls.push([current, total]);
    });

    // Only tasks 1 and 3 have testStrategy
    expect(cli.createChild).toHaveBeenCalledTimes(2);
    expect(mapper.setTestIssueId).toHaveBeenCalledTimes(2);
    expect(progressCalls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('throws when epic ID is missing for a task with testStrategy', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();
    // No epic mapping for task 1

    const tasks = [
      makeTask({ id: 1, testStrategy: 'Some test strategy' }),
    ];

    await expect(createAllTestChildren(tasks, cli, mapper)).rejects.toThrow(
      'Epic ID not found for task 1',
    );
  });

  it('invokes progress callback correctly', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();

    mapper.addEpic(1, 'epic-1');

    cli.createChild.mockResolvedValue({ id: 'test-1', title: 'Test' });

    const tasks = [
      makeTask({ id: 1, testStrategy: 'Test plan' }),
    ];

    const progressCalls: Array<[number, number]> = [];
    await createAllTestChildren(tasks, cli, mapper, (current, total) => {
      progressCalls.push([current, total]);
    });

    expect(progressCalls).toEqual([[1, 1]]);
  });
});
