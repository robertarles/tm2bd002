#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { TaskMasterProjectSchema } from './schemas/taskmaster.js';
import type { TaskMasterProject } from './schemas/taskmaster.js';
import { topologicalSort } from './utils/topological-sort.js';
import { BeadsCli } from './beads/cli.js';
import { IdMapper } from './mapping/id-mapper.js';
import { createEpics } from './sync/epic-creator.js';
import { createAllChildren } from './sync/child-creator.js';
import { createAllTestChildren } from './sync/test-creator.js';
import { wireAllDependencies } from './sync/dependency-wirer.js';
import { syncAllStatuses } from './sync/status-syncer.js';

// ---------------------------------------------------------------------------
// Inline tasks.json parser (until parseTasksJson is exported from schemas)
// ---------------------------------------------------------------------------

async function parseTasksJson(filePath: string): Promise<TaskMasterProject> {
  const content = await fs.readFile(filePath, 'utf-8');
  const json = JSON.parse(content) as Record<string, unknown>;
  // The tasks.json has a "master" wrapper with "tasks" inside
  const projectData = (json.master || json) as Record<string, unknown>;
  return TaskMasterProjectSchema.parse(projectData);
}

// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name('tm2bd')
  .description('Sync task-master-ai tasks to Beads issue tracker')
  .version('1.0.0');

program
  .command('sync')
  .description('Synchronise Task-Master tasks into Beads as epics, children, and dependencies')
  .option('--tasks <path>', 'Path to tasks.json file', '.taskmaster/tasks/tasks.json')
  .option('--project <dir>', 'Beads project directory', '.')
  .option('--dry-run', 'Show what would be created without making changes', false)
  .option('--force', 'Overwrite existing mapping file', false)
  .option('--resume', 'Resume a previously interrupted sync using existing mapping', false)
  .option('--map-file <path>', 'Path for the ID mapping file', './tm2bd-map.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(async (opts: {
    tasks: string;
    project: string;
    dryRun: boolean;
    force: boolean;
    resume: boolean;
    mapFile: string;
    verbose: boolean;
  }) => {
    try {
      const tasksPath = path.resolve(opts.tasks);
      const projectPath = path.resolve(opts.project);
      const mapFilePath = path.resolve(opts.mapFile);

      if (opts.verbose) {
        console.log(chalk.gray(`Tasks file : ${tasksPath}`));
        console.log(chalk.gray(`Project dir: ${projectPath}`));
        console.log(chalk.gray(`Map file   : ${mapFilePath}`));
      }

      // ------------------------------------------------------------------
      // 1. Check beads init
      // ------------------------------------------------------------------
      const cli = new BeadsCli(projectPath, opts.verbose);
      const isInit = await cli.checkInit();
      if (!isInit) {
        console.error(
          chalk.red('Error: Beads is not initialised in this project. Run `bd init` first.'),
        );
        process.exit(1);
      }

      // ------------------------------------------------------------------
      // 2. Check idempotency – mapping file exists?
      // ------------------------------------------------------------------
      const mapExists = await IdMapper.exists(mapFilePath);
      if (mapExists && !opts.force && !opts.resume) {
        console.error(
          chalk.red(
            `Error: Mapping file already exists at ${mapFilePath}.\n` +
            'Use --force to overwrite or --resume to continue a previous sync.',
          ),
        );
        process.exit(1);
      }

      // ------------------------------------------------------------------
      // 3. Load or create IdMapper
      // ------------------------------------------------------------------
      let mapper: IdMapper;
      if (opts.resume && mapExists) {
        console.log(chalk.yellow('Resuming from existing mapping file...'));
        mapper = await IdMapper.load(mapFilePath);
      } else {
        mapper = new IdMapper();
      }

      // ------------------------------------------------------------------
      // 4. Parse tasks.json
      // ------------------------------------------------------------------
      console.log(chalk.blue('Parsing tasks.json...'));
      const project = await parseTasksJson(tasksPath);
      const taskCount = project.tasks.length;
      const subtaskCount = project.tasks.reduce(
        (sum, t) => sum + (t.subtasks?.length ?? 0),
        0,
      );
      console.log(
        chalk.green(`Found ${taskCount} tasks and ${subtaskCount} subtasks.`),
      );

      // ------------------------------------------------------------------
      // 5. Topological sort
      // ------------------------------------------------------------------
      console.log(chalk.blue('Sorting tasks by dependency order...'));
      const sorted = topologicalSort(project.tasks);
      const orderedTasks = sorted.map((s) => s.task);

      if (opts.verbose) {
        for (const entry of sorted) {
          console.log(
            chalk.gray(
              `  Tier ${entry.tier}: [${entry.task.id}] ${entry.task.title}`,
            ),
          );
        }
      }

      // ------------------------------------------------------------------
      // 6. Dry run – just print what would happen
      // ------------------------------------------------------------------
      if (opts.dryRun) {
        console.log(chalk.yellow('\n--- DRY RUN ---\n'));
        console.log(chalk.white('The following operations would be performed:\n'));

        for (const entry of sorted) {
          const task = entry.task;
          console.log(
            chalk.cyan(`  [Tier ${entry.tier}] Create epic: `) +
            chalk.white(`#${task.id} "${task.title}" (priority: ${task.priority})`),
          );
          if (task.subtasks && task.subtasks.length > 0) {
            for (const sub of task.subtasks) {
              console.log(
                chalk.gray(`    Create child: #${task.id}.${sub.id} "${sub.title}"`),
              );
            }
          }
          if (task.dependencies.length > 0) {
            console.log(
              chalk.gray(
                `    Wire dependencies: depends on [${task.dependencies.join(', ')}]`,
              ),
            );
          }
        }

        console.log(chalk.yellow('\n--- END DRY RUN ---'));
        console.log(
          chalk.green(
            `\nWould create ${taskCount} epics, ${subtaskCount} children, and wire dependencies.`,
          ),
        );
        return;
      }

      // ------------------------------------------------------------------
      // 7. Create epics with progress
      // ------------------------------------------------------------------
      console.log(chalk.blue('\nCreating epics...'));
      await createEpics(orderedTasks, cli, mapper, (current, total) => {
        console.log(chalk.green(`  Epic ${current}/${total} created`));
      });

      // ------------------------------------------------------------------
      // 8. Create children
      // ------------------------------------------------------------------
      if (subtaskCount > 0) {
        console.log(chalk.blue('\nCreating child issues...'));
        await createAllChildren(orderedTasks, cli, mapper, (current, total) => {
          console.log(chalk.green(`  Child ${current}/${total} created`));
        });
      }

      // ------------------------------------------------------------------
      // 8b. Create test issues
      // ------------------------------------------------------------------
      const tasksWithTests = orderedTasks.filter(t => t.testStrategy);
      if (tasksWithTests.length > 0) {
        console.log(chalk.blue('\nCreating test issues...'));
        await createAllTestChildren(orderedTasks, cli, mapper, (current, total) => {
          console.log(chalk.green(`  Test ${current}/${total} created`));
        });
      }

      // ------------------------------------------------------------------
      // 9. Wire dependencies
      // ------------------------------------------------------------------
      console.log(chalk.blue('\nWiring dependencies...'));
      await wireAllDependencies(orderedTasks, cli, mapper);
      console.log(chalk.green('  Dependencies wired.'));

      // ------------------------------------------------------------------
      // 10. Sync statuses
      // ------------------------------------------------------------------
      console.log(chalk.blue('\nSyncing statuses...'));
      await syncAllStatuses(orderedTasks, cli, mapper);
      console.log(chalk.green('  Statuses synced.'));

      // ------------------------------------------------------------------
      // 11. Save mapping
      // ------------------------------------------------------------------
      await mapper.save(mapFilePath);
      console.log(chalk.green(`\nMapping saved to ${mapFilePath}`));

      // ------------------------------------------------------------------
      // 12. Success
      // ------------------------------------------------------------------
      console.log(
        chalk.green(chalk.bold(
          `\nSync complete! Created ${taskCount} epics and ${subtaskCount} child issues in Beads.`,
        )),
      );
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(chalk.red(`\nError: ${error.message}`));
        if (opts.verbose && error.stack) {
          console.error(chalk.gray(error.stack));
        }
      } else {
        console.error(chalk.red('\nAn unexpected error occurred.'));
      }
      process.exit(1);
    }
  });

program.parse();
