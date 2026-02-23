import { vi, describe, it, expect, beforeEach } from 'vitest';
import { BeadsCli } from './cli.js';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';
const mockExeca = vi.mocked(execa);

describe('BeadsCli', () => {
  const projectPath = '/tmp/test-project';
  let cli: BeadsCli;

  beforeEach(() => {
    vi.clearAllMocks();
    cli = new BeadsCli(projectPath);
    mockExeca.mockResolvedValue({ stdout: '' } as any);
  });

  describe('exec()', () => {
    it('calls execa with correct args and cwd', async () => {
      await cli.addDependency('id-1', 'id-2');

      expect(mockExeca).toHaveBeenCalledWith('bd', ['dep', 'add', 'id-1', 'id-2'], {
        cwd: projectPath,
      });
    });
  });

  describe('verbose mode', () => {
    it('logs command when verbose is true', async () => {
      const verboseCli = new BeadsCli(projectPath, true);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await verboseCli.updateStatus('issue-1', 'active');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[bd] update issue-1 -s active'
      );
      consoleSpy.mockRestore();
    });
  });

  describe('createEpic()', () => {
    it('constructs correct args and parses JSON output', async () => {
      const mockResult = { id: 'abc-123', title: 'Test Epic' };
      mockExeca.mockResolvedValue({ stdout: JSON.stringify(mockResult) } as any);

      const result = await cli.createEpic('Test Epic', 'A description', 3);

      expect(mockExeca).toHaveBeenCalledWith(
        'bd',
        ['create', 'Test Epic', '-t', 'epic', '-p', '3', '--json', '-d', 'A description'],
        { cwd: projectPath }
      );
      expect(result).toEqual({ id: 'abc-123', title: 'Test Epic' });
    });
  });

  describe('createChild()', () => {
    it('constructs correct args with parent and parses JSON output', async () => {
      const mockResult = { id: 'def-456', title: 'Child Task' };
      mockExeca.mockResolvedValue({ stdout: JSON.stringify(mockResult) } as any);

      const result = await cli.createChild('parent-id', 'Child Task', 'Child desc');

      expect(mockExeca).toHaveBeenCalledWith(
        'bd',
        ['create', 'Child Task', '--parent', 'parent-id', '--json', '-d', 'Child desc'],
        { cwd: projectPath }
      );
      expect(result).toEqual({ id: 'def-456', title: 'Child Task' });
    });
  });

  describe('addDependency()', () => {
    it('calls execa with correct args', async () => {
      await cli.addDependency('blocked-1', 'blocking-2');

      expect(mockExeca).toHaveBeenCalledWith(
        'bd',
        ['dep', 'add', 'blocked-1', 'blocking-2'],
        { cwd: projectPath }
      );
    });
  });

  describe('updateStatus()', () => {
    it('calls execa with correct args', async () => {
      await cli.updateStatus('issue-1', 'in-progress');

      expect(mockExeca).toHaveBeenCalledWith(
        'bd',
        ['update', 'issue-1', '-s', 'in-progress'],
        { cwd: projectPath }
      );
    });
  });

  describe('close()', () => {
    it('calls execa with correct args', async () => {
      await cli.close('issue-99');

      expect(mockExeca).toHaveBeenCalledWith(
        'bd',
        ['close', 'issue-99'],
        { cwd: projectPath }
      );
    });
  });

  describe('checkInit()', () => {
    it('returns true when .beads directory exists', async () => {
      mockExeca.mockResolvedValue({ stdout: '' } as any);

      const result = await cli.checkInit();

      expect(result).toBe(true);
      expect(mockExeca).toHaveBeenCalledWith('test', ['-d', '.beads'], {
        cwd: projectPath,
      });
    });

    it('returns false when .beads directory does not exist', async () => {
      mockExeca.mockRejectedValue(new Error('exit code 1'));

      const result = await cli.checkInit();

      expect(result).toBe(false);
    });
  });
});
