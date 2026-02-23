import { describe, it, expect } from 'vitest';
import {
  TaskMasterSubtaskSchema,
  TaskMasterTaskSchema,
  TaskMasterProjectSchema,
  validateCircularDependencies,
  validateDependencyIds,
} from '../schemas/taskmaster.js';

// ---------------------------------------------------------------------------
// Helpers – reusable minimal valid objects
// ---------------------------------------------------------------------------

function validSubtask(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'Write unit tests',
    description: 'Cover all edge cases',
    status: 'pending' as const,
    ...overrides,
  };
}

function validTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'Implement feature',
    description: 'Full description here',
    status: 'pending' as const,
    priority: 'medium' as const,
    dependencies: [] as number[],
    ...overrides,
  };
}

// ===========================================================================
// TaskMasterSubtaskSchema
// ===========================================================================

describe('TaskMasterSubtaskSchema', () => {
  it('parses a valid subtask with all required fields', () => {
    const input = validSubtask();
    const result = TaskMasterSubtaskSchema.parse(input);
    expect(result).toEqual(input);
  });

  it('accepts optional dependencies and details', () => {
    const input = validSubtask({
      dependencies: [2, 3],
      details: 'Extra implementation notes',
    });
    const result = TaskMasterSubtaskSchema.parse(input);
    expect(result.dependencies).toEqual([2, 3]);
    expect(result.details).toBe('Extra implementation notes');
  });

  it('throws when required field "title" is missing', () => {
    const { title: _, ...noTitle } = validSubtask();
    expect(() => TaskMasterSubtaskSchema.parse(noTitle)).toThrow();
  });

  it('throws when required field "id" is missing', () => {
    const { id: _, ...noId } = validSubtask();
    expect(() => TaskMasterSubtaskSchema.parse(noId)).toThrow();
  });

  it('throws when required field "description" is missing', () => {
    const { description: _, ...noDesc } = validSubtask();
    expect(() => TaskMasterSubtaskSchema.parse(noDesc)).toThrow();
  });

  it('throws when status is invalid', () => {
    expect(() =>
      TaskMasterSubtaskSchema.parse(validSubtask({ status: 'archived' })),
    ).toThrow();
  });

  it('accepts every valid status value', () => {
    for (const status of ['pending', 'in-progress', 'done', 'deferred']) {
      const result = TaskMasterSubtaskSchema.parse(validSubtask({ status }));
      expect(result.status).toBe(status);
    }
  });

  it('coerces string dependencies to numbers', () => {
    const input = validSubtask({ dependencies: ['2', '3'] });
    const result = TaskMasterSubtaskSchema.parse(input);
    expect(result.dependencies).toEqual([2, 3]);
  });
});

// ===========================================================================
// TaskMasterTaskSchema
// ===========================================================================

describe('TaskMasterTaskSchema', () => {
  it('parses a valid task with all required fields', () => {
    const input = validTask();
    const result = TaskMasterTaskSchema.parse(input);
    expect(result).toEqual(input);
  });

  it('throws for an invalid priority', () => {
    expect(() =>
      TaskMasterTaskSchema.parse(validTask({ priority: 'critical' })),
    ).toThrow();
  });

  it('accepts every valid priority value', () => {
    for (const priority of ['high', 'medium', 'low']) {
      const result = TaskMasterTaskSchema.parse(validTask({ priority }));
      expect(result.priority).toBe(priority);
    }
  });

  it('throws when complexity is less than 1', () => {
    expect(() =>
      TaskMasterTaskSchema.parse(validTask({ complexity: 0 })),
    ).toThrow();
  });

  it('throws when complexity is greater than 10', () => {
    expect(() =>
      TaskMasterTaskSchema.parse(validTask({ complexity: 11 })),
    ).toThrow();
  });

  it('accepts complexity at boundaries (1 and 10)', () => {
    expect(TaskMasterTaskSchema.parse(validTask({ complexity: 1 })).complexity).toBe(1);
    expect(TaskMasterTaskSchema.parse(validTask({ complexity: 10 })).complexity).toBe(10);
  });

  it('allows optional fields to be omitted', () => {
    // complexity, subtasks, details, testStrategy are all optional
    const input = validTask();
    const result = TaskMasterTaskSchema.parse(input);
    expect(result.complexity).toBeUndefined();
    expect(result.subtasks).toBeUndefined();
    expect(result.details).toBeUndefined();
    expect(result.testStrategy).toBeUndefined();
  });

  it('coerces string dependencies to numbers', () => {
    const input = validTask({ dependencies: ['1', '2', '3'] });
    const result = TaskMasterTaskSchema.parse(input);
    expect(result.dependencies).toEqual([1, 2, 3]);
  });

  it('accepts mixed string and number dependencies', () => {
    const input = validTask({ dependencies: ['1', 2, '3'] });
    const result = TaskMasterTaskSchema.parse(input);
    expect(result.dependencies).toEqual([1, 2, 3]);
  });

  it('accepts a full task with subtasks and all optional fields', () => {
    const input = validTask({
      complexity: 7,
      details: 'Implementation details',
      testStrategy: 'Integration tests',
      subtasks: [validSubtask()],
    });
    const result = TaskMasterTaskSchema.parse(input);
    expect(result.subtasks).toHaveLength(1);
    expect(result.testStrategy).toBe('Integration tests');
  });
});

// ===========================================================================
// TaskMasterProjectSchema
// ===========================================================================

describe('TaskMasterProjectSchema', () => {
  it('parses a valid project with tasks', () => {
    const input = { tasks: [validTask({ id: 1 }), validTask({ id: 2 })] };
    const result = TaskMasterProjectSchema.parse(input);
    expect(result.tasks).toHaveLength(2);
  });

  it('accepts an empty tasks array', () => {
    const result = TaskMasterProjectSchema.parse({ tasks: [] });
    expect(result.tasks).toEqual([]);
  });

  it('throws when tasks key is missing', () => {
    expect(() => TaskMasterProjectSchema.parse({})).toThrow();
  });
});

// ===========================================================================
// validateCircularDependencies
// ===========================================================================

describe('validateCircularDependencies', () => {
  it('returns valid when tasks have no dependencies', () => {
    const tasks = [
      validTask({ id: 1, dependencies: [] }),
      validTask({ id: 2, dependencies: [] }),
    ];
    const result = validateCircularDependencies(tasks.map((t) => TaskMasterTaskSchema.parse(t)));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('returns valid for a linear dependency chain', () => {
    const tasks = [
      validTask({ id: 1, dependencies: [] }),
      validTask({ id: 2, dependencies: [1] }),
      validTask({ id: 3, dependencies: [2] }),
    ];
    const result = validateCircularDependencies(tasks.map((t) => TaskMasterTaskSchema.parse(t)));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('detects a circular dependency between two tasks', () => {
    const tasks = [
      validTask({ id: 1, dependencies: [2] }),
      validTask({ id: 2, dependencies: [1] }),
    ];
    const result = validateCircularDependencies(tasks.map((t) => TaskMasterTaskSchema.parse(t)));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/Circular dependency/);
  });

  it('detects a self-referencing dependency', () => {
    const tasks = [validTask({ id: 1, dependencies: [1] })];
    const result = validateCircularDependencies(tasks.map((t) => TaskMasterTaskSchema.parse(t)));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/Circular dependency/);
  });

  it('detects a cycle in a three-task ring', () => {
    const tasks = [
      validTask({ id: 1, dependencies: [3] }),
      validTask({ id: 2, dependencies: [1] }),
      validTask({ id: 3, dependencies: [2] }),
    ];
    const result = validateCircularDependencies(tasks.map((t) => TaskMasterTaskSchema.parse(t)));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// validateDependencyIds
// ===========================================================================

describe('validateDependencyIds', () => {
  it('returns valid when all dependency IDs exist', () => {
    const tasks = [
      validTask({ id: 1, dependencies: [] }),
      validTask({ id: 2, dependencies: [1] }),
      validTask({ id: 3, dependencies: [1, 2] }),
    ];
    const result = validateDependencyIds(tasks.map((t) => TaskMasterTaskSchema.parse(t)));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('detects a non-existent dependency ID', () => {
    const tasks = [
      validTask({ id: 1, dependencies: [] }),
      validTask({ id: 2, dependencies: [99] }),
    ];
    const result = validateDependencyIds(tasks.map((t) => TaskMasterTaskSchema.parse(t)));
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/non-existent task 99/);
  });

  it('reports multiple invalid references', () => {
    const tasks = [
      validTask({ id: 1, dependencies: [50, 60] }),
    ];
    const result = validateDependencyIds(tasks.map((t) => TaskMasterTaskSchema.parse(t)));
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });

  it('returns valid for tasks with no dependencies', () => {
    const tasks = [
      validTask({ id: 1, dependencies: [] }),
      validTask({ id: 2, dependencies: [] }),
    ];
    const result = validateDependencyIds(tasks.map((t) => TaskMasterTaskSchema.parse(t)));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
