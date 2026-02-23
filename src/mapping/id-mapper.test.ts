import { describe, it, expect, afterEach } from 'vitest';
import { IdMapper } from './id-mapper.js';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';

describe('IdMapper', () => {
  const tempFiles: string[] = [];

  afterEach(async () => {
    for (const f of tempFiles) {
      try {
        await fs.unlink(f);
      } catch {
        // ignore
      }
    }
    tempFiles.length = 0;
  });

  function getTempFile(): string {
    const filePath = path.join(os.tmpdir(), `id-mapper-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    tempFiles.push(filePath);
    return filePath;
  }

  describe('addEpic + getEpicId', () => {
    it('stores and retrieves an epic mapping', () => {
      const mapper = new IdMapper();
      mapper.addEpic(1, 'beads-epic-1');

      expect(mapper.getEpicId(1)).toBe('beads-epic-1');
    });
  });

  describe('addSubtask + getSubtaskId', () => {
    it('stores and retrieves a subtask mapping with two-level lookup', () => {
      const mapper = new IdMapper();
      mapper.addEpic(10, 'epic-10');
      mapper.addSubtask(10, 101, 'child-101');

      expect(mapper.getSubtaskId(10, 101)).toBe('child-101');
    });
  });

  describe('addSubtask with non-existent parent', () => {
    it('throws when parent task does not exist', () => {
      const mapper = new IdMapper();

      expect(() => mapper.addSubtask(999, 1, 'child-1')).toThrow(
        'Task 999 not found in mapping'
      );
    });
  });

  describe('getEpicId with missing ID', () => {
    it('returns undefined for a non-existent tmId', () => {
      const mapper = new IdMapper();

      expect(mapper.getEpicId(42)).toBeUndefined();
    });
  });

  describe('multiple epics with subtasks', () => {
    it('does not cross-contaminate between epics', () => {
      const mapper = new IdMapper();
      mapper.addEpic(1, 'epic-a');
      mapper.addEpic(2, 'epic-b');
      mapper.addSubtask(1, 11, 'child-a1');
      mapper.addSubtask(1, 12, 'child-a2');
      mapper.addSubtask(2, 21, 'child-b1');

      // Subtasks belong to correct parents
      expect(mapper.getSubtaskId(1, 11)).toBe('child-a1');
      expect(mapper.getSubtaskId(1, 12)).toBe('child-a2');
      expect(mapper.getSubtaskId(2, 21)).toBe('child-b1');

      // Cross-lookups return undefined
      expect(mapper.getSubtaskId(1, 21)).toBeUndefined();
      expect(mapper.getSubtaskId(2, 11)).toBeUndefined();

      // Epic IDs are independent
      expect(mapper.getEpicId(1)).toBe('epic-a');
      expect(mapper.getEpicId(2)).toBe('epic-b');
    });
  });

  describe('save() and load()', () => {
    it('preserves all mappings through save and load', async () => {
      const filePath = getTempFile();
      const mapper = new IdMapper();
      mapper.addEpic(1, 'epic-1');
      mapper.addEpic(2, 'epic-2');
      mapper.addSubtask(1, 11, 'child-11');
      mapper.addSubtask(2, 21, 'child-21');
      mapper.setTestIssueId(1, 'test-issue-1');

      await mapper.save(filePath);

      const loaded = await IdMapper.load(filePath);

      expect(loaded.getEpicId(1)).toBe('epic-1');
      expect(loaded.getEpicId(2)).toBe('epic-2');
      expect(loaded.getSubtaskId(1, 11)).toBe('child-11');
      expect(loaded.getSubtaskId(2, 21)).toBe('child-21');
      expect(loaded.getTestIssueId(1)).toBe('test-issue-1');
      expect(loaded.getStats()).toEqual({
        epicCount: 2,
        childCount: 2,
        testIssueCount: 1,
      });
    });
  });

  describe('exists()', () => {
    it('returns true for an existing file', async () => {
      const filePath = getTempFile();
      await fs.writeFile(filePath, '{}', 'utf-8');

      expect(await IdMapper.exists(filePath)).toBe(true);
    });

    it('returns false for a missing file', async () => {
      const filePath = path.join(os.tmpdir(), 'nonexistent-file-' + Date.now() + '.json');

      expect(await IdMapper.exists(filePath)).toBe(false);
    });
  });

  describe('setTestIssueId + getTestIssueId', () => {
    it('stores and retrieves a test issue ID', () => {
      const mapper = new IdMapper();
      mapper.addEpic(5, 'epic-5');
      mapper.setTestIssueId(5, 'test-beads-id');

      expect(mapper.getTestIssueId(5)).toBe('test-beads-id');
    });

    it('throws when setting test issue ID for non-existent task', () => {
      const mapper = new IdMapper();

      expect(() => mapper.setTestIssueId(999, 'test-id')).toThrow(
        'Task 999 not found in mapping'
      );
    });

    it('returns undefined for task without test issue ID', () => {
      const mapper = new IdMapper();
      mapper.addEpic(7, 'epic-7');

      expect(mapper.getTestIssueId(7)).toBeUndefined();
    });
  });

  describe('getStats()', () => {
    it('returns correct counts', () => {
      const mapper = new IdMapper();
      mapper.addEpic(1, 'e1');
      mapper.addEpic(2, 'e2');
      mapper.addEpic(3, 'e3');
      mapper.addSubtask(1, 11, 'c11');
      mapper.addSubtask(1, 12, 'c12');
      mapper.addSubtask(2, 21, 'c21');
      mapper.setTestIssueId(1, 'ti-1');
      mapper.setTestIssueId(3, 'ti-3');

      const stats = mapper.getStats();

      expect(stats.epicCount).toBe(3);
      expect(stats.childCount).toBe(3);
      expect(stats.testIssueCount).toBe(2);
    });

    it('returns zeros for empty mapper', () => {
      const mapper = new IdMapper();
      const stats = mapper.getStats();

      expect(stats).toEqual({
        epicCount: 0,
        childCount: 0,
        testIssueCount: 0,
      });
    });
  });
});
