import { describe, it, expect, vi } from 'vitest';
import type { TaskMasterTask } from '../schemas/taskmaster.js';
import {
  formatEpicDescription,
  mapPriority,
  createEpic,
  createEpics,
} from './epic-creator.js';

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

describe('formatEpicDescription', () => {
  it('includes all fields when present', () => {
    const task = makeTask({
      description: 'Main description',
      details: 'Detailed implementation notes',
      testStrategy: 'Unit tests for all functions',
      complexity: 7,
      status: 'in-progress',
    });

    const result = formatEpicDescription(task);

    expect(result).toContain('## Description');
    expect(result).toContain('Main description');
    expect(result).toContain('## Implementation Details');
    expect(result).toContain('Detailed implementation notes');
    expect(result).toContain('## Test Strategy');
    expect(result).toContain('Unit tests for all functions');
    expect(result).toContain('## Metadata');
    expect(result).toContain('**Task-Master ID:** 1');
    expect(result).toContain('**Complexity:** 7/10');
    expect(result).toContain('**Original Status:** in-progress');
  });

  it('omits optional sections when fields are absent', () => {
    const task = makeTask({
      description: 'Minimal task',
      status: 'pending',
    });

    const result = formatEpicDescription(task);

    expect(result).toContain('## Description');
    expect(result).toContain('Minimal task');
    expect(result).not.toContain('## Implementation Details');
    expect(result).not.toContain('## Test Strategy');
    expect(result).not.toContain('**Complexity:**');
    expect(result).toContain('**Original Status:** pending');
  });
});

describe('mapPriority', () => {
  it('maps high to 0', () => {
    expect(mapPriority('high')).toBe(0);
  });

  it('maps medium to 1', () => {
    expect(mapPriority('medium')).toBe(1);
  });

  it('maps low to 2', () => {
    expect(mapPriority('low')).toBe(2);
  });
});

describe('createEpic', () => {
  it('calls cli.createEpic and mapper.addEpic with correct arguments', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();
    const task = makeTask({ id: 5, title: 'My task', priority: 'high' });

    cli.createEpic.mockResolvedValue({ id: 'beads-epic-5', title: 'My task' });

    const result = await createEpic(task, cli, mapper);

    expect(result).toBe('beads-epic-5');
    expect(cli.createEpic).toHaveBeenCalledOnce();

    const [title, description, priority] = cli.createEpic.mock.calls[0];
    expect(title).toBe('My task');
    expect(description).toContain('Initialize the project scaffolding');
    expect(priority).toBe(0);

    expect(mapper.addEpic).toHaveBeenCalledWith(5, 'beads-epic-5');
  });
});

describe('createEpics', () => {
  it('creates all epics and invokes progress callback', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();

    let callCount = 0;
    cli.createEpic.mockImplementation(async () => {
      callCount++;
      return { id: `epic-${callCount}`, title: 'Test' };
    });

    const tasks = [
      makeTask({ id: 1, title: 'Task 1' }),
      makeTask({ id: 2, title: 'Task 2' }),
      makeTask({ id: 3, title: 'Task 3' }),
    ];

    const progressCalls: Array<[number, number]> = [];
    const onProgress = (current: number, total: number) => {
      progressCalls.push([current, total]);
    };

    await createEpics(tasks, cli, mapper, onProgress);

    expect(cli.createEpic).toHaveBeenCalledTimes(3);
    expect(mapper.addEpic).toHaveBeenCalledTimes(3);
    expect(progressCalls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });
});
