import type { Database } from '../app/database/database.types';
import type { Config } from '../config/config.types';
import type { TaskDefinition } from './tasks.models';
import cron from 'node-cron';
import { createLogger, wrapWithLoggerContext } from '../shared/logger/logger';
import { generateId } from '../shared/random/ids';

export { createTaskScheduler };

const logger = createLogger({ namespace: 'tasks:scheduler' });

function createTaskScheduler({
  config,
  taskDefinitions,
  tasksArgs,
}: {
  config: Config;
  taskDefinitions: TaskDefinition[];
  tasksArgs: { db: Database };
}) {
  const scheduledTasks = taskDefinitions.map((taskDefinition) => {
    const isEnabled = taskDefinition.getIsEnabled({ config });
    const cronSchedule = taskDefinition.getCronSchedule({ config });
    const runOnStartup = taskDefinition.getRunOnStartup({ config });

    if (!isEnabled) {
      return undefined;
    }

    const task = cron.schedule(
      cronSchedule,
      async () => wrapWithLoggerContext(
        {
          taskId: generateId({ prefix: 'task' }),
          taskName: taskDefinition.taskName,
        },
        async () => taskDefinition.run({ ...tasksArgs, config }),
      ),
      {
        scheduled: false,
        runOnInit: runOnStartup,
      },
    );

    return { job: task, taskName: taskDefinition.taskName };
  }).filter(Boolean);

  return {
    taskScheduler: {
      scheduledTasks,
      start() {
        scheduledTasks.forEach(({ taskName, job }) => {
          job.start();
          logger.debug({ taskName }, 'Task scheduled');
        });
      },

      stop() {
        scheduledTasks.forEach(({ taskName, job }) => {
          job.stop();
          logger.debug({ taskName }, 'Task unscheduled');
        });
      },
    },
  };
}
