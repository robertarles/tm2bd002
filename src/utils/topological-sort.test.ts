import { describe, it, expect } from 'vitest';
import { topologicalSort } from '../utils/topological-sort.js';
import type { SortedTask } from '../utils/topological-sort.js';

// ---------------------------------------------------------------------------
// Helper to build minimal task objects
// ---------------------------------------------------------------------------

function task(id: number, dependencies: number[] = []) {
  return { id, dependencies };
}

// ===========================================================================
// topologicalSort
// ===========================================================================

describe('topologicalSort', () => {
  // ---- No dependencies ----

  it('assigns tier 0 to all tasks with no dependencies', () => {
    const tasks = [task(3), task(1), task(2)];
    const result = topologicalSort(tasks);

    for (const entry of result) {
      expect(entry.tier).toBe(0);
    }
  });

  it('sorts tasks with no dependencies by id ascending', () => {
    const tasks = [task(3), task(1), task(2)];
    const result = topologicalSort(tasks);
    const ids = result.map((e) => e.task.id);
    expect(ids).toEqual([1, 2, 3]);
  });

  // ---- Linear chain ----

  it('assigns ascending tiers for a linear chain (3 -> 2 -> 1)', () => {
    const tasks = [task(1), task(2, [1]), task(3, [2])];
    const result = topologicalSort(tasks);

    const tierOf = (id: number) => result.find((e) => e.task.id === id)!.tier;
    expect(tierOf(1)).toBe(0);
    expect(tierOf(2)).toBe(1);
    expect(tierOf(3)).toBe(2);
  });

  it('returns tasks in dependency order for a linear chain', () => {
    const tasks = [task(3, [2]), task(1), task(2, [1])];
    const result = topologicalSort(tasks);
    const ids = result.map((e) => e.task.id);
    expect(ids).toEqual([1, 2, 3]);
  });

  // ---- Diamond dependency ----

  it('assigns correct tiers for a diamond dependency graph', () => {
    // 4 depends on 2 and 3; 2 and 3 both depend on 1
    const tasks = [task(1), task(2, [1]), task(3, [1]), task(4, [2, 3])];
    const result = topologicalSort(tasks);

    const tierOf = (id: number) => result.find((e) => e.task.id === id)!.tier;
    expect(tierOf(1)).toBe(0);
    expect(tierOf(2)).toBe(1);
    expect(tierOf(3)).toBe(1);
    expect(tierOf(4)).toBe(2);
  });

  it('orders diamond tasks by tier then id', () => {
    const tasks = [task(4, [2, 3]), task(2, [1]), task(3, [1]), task(1)];
    const result = topologicalSort(tasks);
    const ids = result.map((e) => e.task.id);
    expect(ids).toEqual([1, 2, 3, 4]);
  });

  // ---- Error cases ----

  it('throws on circular dependency between two tasks', () => {
    const tasks = [task(1, [2]), task(2, [1])];
    expect(() => topologicalSort(tasks)).toThrow(/Circular dependency/);
  });

  it('throws on a three-task cycle', () => {
    const tasks = [task(1, [3]), task(2, [1]), task(3, [2])];
    expect(() => topologicalSort(tasks)).toThrow(/Circular dependency/);
  });

  it('throws when a dependency references a non-existent task', () => {
    const tasks = [task(1), task(2, [99])];
    expect(() => topologicalSort(tasks)).toThrow(/not found/);
  });

  it('throws on a self-referencing dependency', () => {
    const tasks = [task(1, [1])];
    expect(() => topologicalSort(tasks)).toThrow(/Circular dependency/);
  });

  // ---- Deterministic ordering ----

  it('produces identical output across multiple runs', () => {
    const tasks = [task(5, [1, 2]), task(2, [1]), task(1), task(3), task(4, [3])];
    const first = topologicalSort(tasks);
    const second = topologicalSort(tasks);
    const third = topologicalSort(tasks);

    const toIds = (r: SortedTask[]) => r.map((e) => e.task.id);
    expect(toIds(first)).toEqual(toIds(second));
    expect(toIds(second)).toEqual(toIds(third));
  });

  // ---- Disconnected components ----

  it('processes disconnected components correctly', () => {
    // Two independent chains: 1->2 and 3->4
    const tasks = [task(1), task(2, [1]), task(3), task(4, [3])];
    const result = topologicalSort(tasks);

    const tierOf = (id: number) => result.find((e) => e.task.id === id)!.tier;
    expect(tierOf(1)).toBe(0);
    expect(tierOf(3)).toBe(0);
    expect(tierOf(2)).toBe(1);
    expect(tierOf(4)).toBe(1);

    // All four tasks should be present
    expect(result).toHaveLength(4);
  });

  it('sorts disconnected components by tier then id', () => {
    const tasks = [task(10), task(20, [10]), task(5), task(15, [5])];
    const result = topologicalSort(tasks);
    const ids = result.map((e) => e.task.id);
    expect(ids).toEqual([5, 10, 15, 20]);
  });

  // ---- Empty input ----

  it('returns an empty array for empty input', () => {
    const result = topologicalSort([]);
    expect(result).toEqual([]);
  });

  // ---- Single task ----

  it('handles a single task with no dependencies', () => {
    const result = topologicalSort([task(1)]);
    expect(result).toHaveLength(1);
    expect(result[0].tier).toBe(0);
    expect(result[0].task.id).toBe(1);
  });

  // ---- Preserves original task reference ----

  it('preserves original task objects in the output', () => {
    const original = { id: 1, dependencies: [], extra: 'metadata' };
    const result = topologicalSort([original]);
    expect(result[0].task).toBe(original);
    expect((result[0].task as typeof original).extra).toBe('metadata');
  });
});
