import { execa } from 'execa';
import { z } from 'zod';

export interface BeadsCreateResult {
  id: string;
  title: string;
  type?: string;
}

const BeadsCreateOutputSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string().optional()
});

export class BeadsCli {
  private projectPath: string;
  private verbose: boolean;

  constructor(projectPath: string, verbose: boolean = false) {
    this.projectPath = projectPath;
    this.verbose = verbose;
  }

  private async exec(args: string[]): Promise<string> {
    if (this.verbose) {
      console.log(`[bd] ${args.join(' ')}`);
    }
    const result = await execa('bd', args, { cwd: this.projectPath });
    if (this.verbose && result.stdout) {
      console.log(result.stdout);
    }
    return result.stdout;
  }

  async createEpic(title: string, description: string, priority: number): Promise<BeadsCreateResult> {
    const args = ['create', title, '-t', 'epic', '-p', priority.toString(), '--json'];
    if (description) {
      args.push('-d', description);
    }
    const output = await this.exec(args);
    return BeadsCreateOutputSchema.parse(JSON.parse(output));
  }

  async createChild(parentId: string, title: string, description: string): Promise<BeadsCreateResult> {
    const args = ['create', title, '--parent', parentId, '--json'];
    if (description) {
      args.push('-d', description);
    }
    const output = await this.exec(args);
    return BeadsCreateOutputSchema.parse(JSON.parse(output));
  }

  async addDependency(blockedId: string, blockingId: string): Promise<void> {
    await this.exec(['dep', 'add', blockedId, blockingId]);
  }

  async updateStatus(issueId: string, status: string): Promise<void> {
    await this.exec(['update', issueId, '-s', status]);
  }

  async close(issueId: string): Promise<void> {
    await this.exec(['close', issueId]);
  }

  async checkInit(): Promise<boolean> {
    try {
      await execa('test', ['-d', '.beads'], { cwd: this.projectPath });
      return true;
    } catch {
      return false;
    }
  }
}
