import { describe, it, expect, vi } from 'vitest';
import type { TaskMasterTask, TaskMasterSubtask } from '../schemas/taskmaster.js';
import {
  wireEpicDependencies,
  wireSubtaskDependencies,
  wireTestDependencies,
  wireAllDependencies,
} from './dependency-wirer.js';

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
    title: 'Subtask',
    description: 'Subtask description',
    status: 'pending',
    ...overrides,
  };
}

function makeTask(overrides: Partial<TaskMasterTask> = {}): TaskMasterTask {
  return {
    id: 1,
    title: 'Task',
    description: 'Task description',
    status: 'pending',
    priority: 'medium',
    dependencies: [],
    ...overrides,
  };
}

describe('wireEpicDependencies', () => {
  it('makes no CLI calls when tasks have no dependencies', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();

    const tasks = [
      makeTask({ id: 1, dependencies: [] }),
      makeTask({ id: 2, dependencies: [] }),
    ];

    await wireEpicDependencies(tasks, cli, mapper);

    expect(cli.addDependency).not.toHaveBeenCalled();
  });

  it('wires dependencies with correct blocked and blocking IDs', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();

    mapper.addEpic(1, 'beads-1');
    mapper.addEpic(2, 'beads-2');
    mapper.addEpic(3, 'beads-3');

    const tasks = [
      makeTask({ id: 1, dependencies: [] }),
      makeTask({ id: 2, dependencies: [1] }),
      makeTask({ id: 3, dependencies: [1, 2] }),
    ];

    await wireEpicDependencies(tasks, cli, mapper);

    expect(cli.addDependency).toHaveBeenCalledTimes(3);
    // Task 2 depends on task 1: blocked=beads-2, blocking=beads-1
    expect(cli.addDependency).toHaveBeenCalledWith('beads-2', 'beads-1');
    // Task 3 depends on task 1: blocked=beads-3, blocking=beads-1
    expect(cli.addDependency).toHaveBeenCalledWith('beads-3', 'beads-1');
    // Task 3 depends on task 2: blocked=beads-3, blocking=beads-2
    expect(cli.addDependency).toHaveBeenCalledWith('beads-3', 'beads-2');
  });

  it('throws when blocked epic ID is missing', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();
    // Do NOT register epic for task 2

    mapper.addEpic(1, 'beads-1');

    const tasks = [
      makeTask({ id: 2, title: 'Missing task', dependencies: [1] }),
    ];

    await expect(wireEpicDependencies(tasks, cli, mapper)).rejects.toThrow(
      /no Beads ID found for blocked task 2/,
    );
  });

  it('throws when blocking epic ID is missing', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();

    mapper.addEpic(2, 'beads-2');
    // Do NOT register epic for task 1

    const tasks = [
      makeTask({ id: 2, title: 'Dependent', dependencies: [1] }),
    ];

    await expect(wireEpicDependencies(tasks, cli, mapper)).rejects.toThrow(
      /no Beads ID found for blocking task 1/,
    );
  });
});

describe('wireSubtaskDependencies', () => {
  it('wires intra-epic subtask dependencies', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();

    mapper.addSubtask(1, 1, 'sub-1-1');
    mapper.addSubtask(1, 2, 'sub-1-2');
    mapper.addSubtask(1, 3, 'sub-1-3');

    const tasks = [
      makeTask({
        id: 1,
        subtasks: [
          makeSubtask({ id: 1, dependencies: [] }),
          makeSubtask({ id: 2, dependencies: [1] }),
          makeSubtask({ id: 3, dependencies: [1, 2] }),
        ],
      }),
    ];

    await wireSubtaskDependencies(tasks, cli, mapper);

    expect(cli.addDependency).toHaveBeenCalledTimes(3);
    // Subtask 2 depends on subtask 1
    expect(cli.addDependency).toHaveBeenCalledWith('sub-1-2', 'sub-1-1');
    // Subtask 3 depends on subtask 1
    expect(cli.addDependency).toHaveBeenCalledWith('sub-1-3', 'sub-1-1');
    // Subtask 3 depends on subtask 2
    expect(cli.addDependency).toHaveBeenCalledWith('sub-1-3', 'sub-1-2');
  });

  it('skips tasks with no subtasks', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();

    const tasks = [
      makeTask({ id: 1, subtasks: undefined }),
      makeTask({ id: 2, subtasks: [] }),
    ];

    await wireSubtaskDependencies(tasks, cli, mapper);

    expect(cli.addDependency).not.toHaveBeenCalled();
  });

  it('skips subtasks with no dependencies', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();

    mapper.addSubtask(1, 1, 'sub-1-1');

    const tasks = [
      makeTask({
        id: 1,
        subtasks: [
          makeSubtask({ id: 1 }), // no dependencies field
        ],
      }),
    ];

    await wireSubtaskDependencies(tasks, cli, mapper);

    expect(cli.addDependency).not.toHaveBeenCalled();
  });
});

describe('wireTestDependencies', () => {
  it('wires test issue to all subtasks of the task', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();

    mapper.addSubtask(1, 1, 'sub-1-1');
    mapper.addSubtask(1, 2, 'sub-1-2');
    mapper.setTestIssueId(1, 'test-1');

    const tasks = [
      makeTask({
        id: 1,
        subtasks: [
          makeSubtask({ id: 1 }),
          makeSubtask({ id: 2 }),
        ],
      }),
    ];

    const count = await wireTestDependencies(tasks, cli, mapper);

    expect(count).toBe(2);
    expect(cli.addDependency).toHaveBeenCalledTimes(2);
    expect(cli.addDependency).toHaveBeenCalledWith('test-1', 'sub-1-1');
    expect(cli.addDependency).toHaveBeenCalledWith('test-1', 'sub-1-2');
  });

  it('skips tasks without test issues', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();

    mapper.addSubtask(1, 1, 'sub-1-1');
    // No test issue registered

    const tasks = [
      makeTask({
        id: 1,
        subtasks: [makeSubtask({ id: 1 })],
      }),
    ];

    const count = await wireTestDependencies(tasks, cli, mapper);

    expect(count).toBe(0);
    expect(cli.addDependency).not.toHaveBeenCalled();
  });

  it('skips tasks without subtasks', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();

    mapper.setTestIssueId(1, 'test-1');

    const tasks = [
      makeTask({ id: 1, subtasks: [] }),
    ];

    const count = await wireTestDependencies(tasks, cli, mapper);

    expect(count).toBe(0);
    expect(cli.addDependency).not.toHaveBeenCalled();
  });
});

describe('wireAllDependencies', () => {
  it('calls all three wiring functions', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();

    // Set up epic deps: task 2 depends on task 1
    mapper.addEpic(1, 'beads-1');
    mapper.addEpic(2, 'beads-2');

    // Set up subtask deps: subtask 2 of task 1 depends on subtask 1
    mapper.addSubtask(1, 1, 'sub-1-1');
    mapper.addSubtask(1, 2, 'sub-1-2');

    // Set up test deps
    mapper.setTestIssueId(1, 'test-1');

    const tasks = [
      makeTask({
        id: 1,
        dependencies: [],
        subtasks: [
          makeSubtask({ id: 1, dependencies: [] }),
          makeSubtask({ id: 2, dependencies: [1] }),
        ],
      }),
      makeTask({
        id: 2,
        dependencies: [1],
        subtasks: [],
      }),
    ];

    await wireAllDependencies(tasks, cli, mapper);

    // Epic dep: task 2 blocked by task 1
    expect(cli.addDependency).toHaveBeenCalledWith('beads-2', 'beads-1');
    // Subtask dep: subtask 1.2 blocked by subtask 1.1
    expect(cli.addDependency).toHaveBeenCalledWith('sub-1-2', 'sub-1-1');
    // Test deps: test-1 blocked by sub-1-1 and sub-1-2
    expect(cli.addDependency).toHaveBeenCalledWith('test-1', 'sub-1-1');
    expect(cli.addDependency).toHaveBeenCalledWith('test-1', 'sub-1-2');

    expect(cli.addDependency).toHaveBeenCalledTimes(4);
  });
});
