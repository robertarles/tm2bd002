import fs from 'fs/promises';

export interface TaskMapping {
  tmId: number;
  beadsId: string;
  type: 'epic';
  subtasks: SubtaskMapping[];
  testIssueId?: string;
}

export interface SubtaskMapping {
  tmId: number;
  beadsId: string;
  type: 'child';
}

export interface MappingFile {
  version: string;
  generatedAt: string;
  tasks: TaskMapping[];
}

export class IdMapper {
  private tasks: TaskMapping[] = [];

  addEpic(tmId: number, beadsId: string): void {
    this.tasks.push({ tmId, beadsId, type: 'epic', subtasks: [] });
  }

  addSubtask(taskTmId: number, subtaskTmId: number, beadsId: string): void {
    const task = this.tasks.find(t => t.tmId === taskTmId);
    if (!task) throw new Error(`Task ${taskTmId} not found in mapping`);
    task.subtasks.push({ tmId: subtaskTmId, beadsId, type: 'child' });
  }

  getEpicId(tmId: number): string | undefined {
    return this.tasks.find(t => t.tmId === tmId)?.beadsId;
  }

  getSubtaskId(taskTmId: number, subtaskTmId: number): string | undefined {
    const task = this.tasks.find(t => t.tmId === taskTmId);
    return task?.subtasks.find(s => s.tmId === subtaskTmId)?.beadsId;
  }

  setTestIssueId(taskTmId: number, beadsId: string): void {
    const task = this.tasks.find(t => t.tmId === taskTmId);
    if (!task) throw new Error(`Task ${taskTmId} not found in mapping`);
    task.testIssueId = beadsId;
  }

  getTestIssueId(taskTmId: number): string | undefined {
    return this.tasks.find(t => t.tmId === taskTmId)?.testIssueId;
  }

  getStats(): { epicCount: number; childCount: number; testIssueCount: number } {
    return {
      epicCount: this.tasks.length,
      childCount: this.tasks.reduce((sum, t) => sum + t.subtasks.length, 0),
      testIssueCount: this.tasks.filter(t => t.testIssueId !== undefined).length,
    };
  }

  async save(filePath: string): Promise<void> {
    const data: MappingFile = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      tasks: this.tasks
    };
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  static async load(filePath: string): Promise<IdMapper> {
    const content = await fs.readFile(filePath, 'utf-8');
    const data: MappingFile = JSON.parse(content);
    const mapper = new IdMapper();
    mapper.tasks = data.tasks;
    return mapper;
  }

  static async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
