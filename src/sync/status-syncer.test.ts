import { describe, it, expect, vi } from 'vitest';
import type { TaskMasterTask, TaskMasterSubtask } from '../schemas/taskmaster.js';
import {
  mapStatus,
  syncEpicStatus,
  syncSubtaskStatus,
  syncAllStatuses,
} from './status-syncer.js';

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

describe('mapStatus', () => {
  it('maps pending to no status and no close', () => {
    expect(mapStatus('pending')).toEqual({ close: false });
  });

  it('maps in-progress to in_progress status', () => {
    expect(mapStatus('in-progress')).toEqual({ status: 'in_progress', close: false });
  });

  it('maps done to close', () => {
    expect(mapStatus('done')).toEqual({ close: true });
  });

  it('maps deferred to deferred status', () => {
    expect(mapStatus('deferred')).toEqual({ status: 'deferred', close: false });
  });

  it('maps unknown status to no action', () => {
    expect(mapStatus('unknown-status')).toEqual({ close: false });
  });
});

describe('syncEpicStatus', () => {
  it('calls cli.close when status is done', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();
    mapper.addEpic(1, 'beads-1');

    const task = makeTask({ id: 1, status: 'done' });

    await syncEpicStatus(task, cli, mapper);

    expect(cli.close).toHaveBeenCalledWith('beads-1');
    expect(cli.updateStatus).not.toHaveBeenCalled();
  });

  it('calls cli.updateStatus when status is in-progress', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();
    mapper.addEpic(1, 'beads-1');

    const task = makeTask({ id: 1, status: 'in-progress' });

    await syncEpicStatus(task, cli, mapper);

    expect(cli.updateStatus).toHaveBeenCalledWith('beads-1', 'in_progress');
    expect(cli.close).not.toHaveBeenCalled();
  });

  it('makes no calls when status is pending', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();
    mapper.addEpic(1, 'beads-1');

    const task = makeTask({ id: 1, status: 'pending' });

    await syncEpicStatus(task, cli, mapper);

    expect(cli.updateStatus).not.toHaveBeenCalled();
    expect(cli.close).not.toHaveBeenCalled();
  });

  it('throws when epic ID is missing', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();
    // No epic mapping

    const task = makeTask({ id: 42, status: 'done' });

    await expect(syncEpicStatus(task, cli, mapper)).rejects.toThrow(
      'No beads epic found for task 42',
    );
  });
});

describe('syncSubtaskStatus', () => {
  it('processes all subtasks with appropriate status actions', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();

    mapper.addSubtask(1, 1, 'sub-1');
    mapper.addSubtask(1, 2, 'sub-2');
    mapper.addSubtask(1, 3, 'sub-3');

    const task = makeTask({
      id: 1,
      subtasks: [
        makeSubtask({ id: 1, status: 'done' }),
        makeSubtask({ id: 2, status: 'in-progress' }),
        makeSubtask({ id: 3, status: 'pending' }),
      ],
    });

    await syncSubtaskStatus(task, cli, mapper);

    expect(cli.close).toHaveBeenCalledWith('sub-1');
    expect(cli.updateStatus).toHaveBeenCalledWith('sub-2', 'in_progress');
    // pending subtask: no calls
    expect(cli.close).toHaveBeenCalledTimes(1);
    expect(cli.updateStatus).toHaveBeenCalledTimes(1);
  });

  it('does nothing when subtasks is undefined', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();

    const task = makeTask({ id: 1, subtasks: undefined });

    await syncSubtaskStatus(task, cli, mapper);

    expect(cli.close).not.toHaveBeenCalled();
    expect(cli.updateStatus).not.toHaveBeenCalled();
  });

  it('skips subtasks with no mapper entry', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();
    // Do NOT add subtask mapping

    const task = makeTask({
      id: 1,
      subtasks: [
        makeSubtask({ id: 1, status: 'done' }),
      ],
    });

    await syncSubtaskStatus(task, cli, mapper);

    expect(cli.close).not.toHaveBeenCalled();
    expect(cli.updateStatus).not.toHaveBeenCalled();
  });
});

describe('syncAllStatuses', () => {
  it('syncs both epic and subtask statuses for all tasks', async () => {
    const cli = createMockCli();
    const mapper = createMockMapper();

    mapper.addEpic(1, 'beads-1');
    mapper.addEpic(2, 'beads-2');
    mapper.addSubtask(1, 1, 'sub-1-1');

    const tasks = [
      makeTask({
        id: 1,
        status: 'in-progress',
        subtasks: [
          makeSubtask({ id: 1, status: 'done' }),
        ],
      }),
      makeTask({
        id: 2,
        status: 'done',
        subtasks: [],
      }),
    ];

    await syncAllStatuses(tasks, cli, mapper);

    // Epic 1: in-progress
    expect(cli.updateStatus).toHaveBeenCalledWith('beads-1', 'in_progress');
    // Epic 2: done
    expect(cli.close).toHaveBeenCalledWith('beads-2');
    // Subtask 1.1: done
    expect(cli.close).toHaveBeenCalledWith('sub-1-1');
  });
});
