import type { Job, JobHelpers } from "graphile-worker"
import { consoleLogFactory, Logger } from "graphile-worker"

import type { TaskHelpers, TaskHelpersContext } from "./taskHelpers"
import { resolveTaskHelpers } from "./taskHelpers"
import type { Task, TaskResult } from "./tasks"

/**
 * Run a task handler directly, building helpers for the manual run.
 */
export function runTask<TPayload>(
  task: Task<TPayload>,
  taskIdentifier: string,
  payload: TPayload,
  helpers?: TaskHelpers<TPayload>,
): TaskResult {
  const defaultHelpers = createDefaultTaskHelpers({ payload, taskIdentifier })
  return task(payload, resolveTaskHelpers(helpers, { defaultHelpers, payload, taskIdentifier }))
}

function createDefaultTaskHelpers<TPayload>({ payload, taskIdentifier }: Omit<TaskHelpersContext<TPayload>, "defaultHelpers">): JobHelpers {
  const now = new Date()
  const job = {
    attempts: 0,
    created_at: now,
    flags: null,
    id: `manual:${taskIdentifier}`,
    is_available: true,
    job_queue_id: null,
    key: null,
    last_error: null,
    locked_at: null,
    locked_by: null,
    max_attempts: 1,
    payload,
    priority: 0,
    revision: 0,
    run_at: now,
    task_id: 0,
    task_identifier: taskIdentifier,
    updated_at: now,
  } as Job
  const logger = new Logger(consoleLogFactory).scope({
    label: "job",
    taskIdentifier,
    jobId: job.id,
  })

  return {
    job,
    logger,
    addJob: () => {
      throw new Error("Cannot use helpers.addJob during manual task run. Pass helpers to provide an addJob implementation.")
    },
    withPgClient: () => {
      throw new Error("Cannot use helpers.withPgClient during manual task run. Pass helpers to provide a database client.")
    },
    query: () => {
      throw new Error("Cannot use helpers.query during manual task run. Pass helpers to provide a database client.")
    },
    getQueueName: () => {
      throw new Error("Cannot use helpers.getQueueName during manual task run. Pass helpers to provide queue metadata.")
    },
  }
}
