import type { AddJobFunction, Job, TaskSpec } from "graphile-worker"

import type { TaskHelpers } from "./taskHelpers"
import { resolveTaskHelpers } from "./taskHelpers"
import type { NamedTask, Task } from "./tasks"
import { defineTask } from "./tasks"

/**
 * A named task with helpers for enqueueing and manually running itself.
 */
export type BoundNamedTask<TIdentifier extends string, TPayload> = NamedTask<TIdentifier, TPayload> & {
  /**
   * Enqueue this task through the addJob implementation bound by createDefineTask.
   */
  addJob(payload: TPayload, spec?: TaskSpec): Promise<Job>
}

/**
 * Options for creating a defineTask function bound to an addJob implementation.
 */
export type CreateDefineTaskOptions = {
  /**
   * Function used by bound tasks to enqueue themselves.
   */
  addJob: AddJobFunction
  /**
   * Default helpers used by BoundNamedTask.run, overridable per call.
   */
  helpers?: TaskHelpers
}

/**
 * Create a defineTask function bound to an addJob implementation.
 */
export function createDefineTask(options: CreateDefineTaskOptions) {
  return function defineBoundNamedTask<TIdentifier extends string, TPayload>(
    taskIdentifier: TIdentifier,
    task: Task<TPayload>,
  ): BoundNamedTask<TIdentifier, TPayload> {
    const definedTask = defineTask(taskIdentifier, task) as BoundNamedTask<TIdentifier, TPayload>
    definedTask.addJob = (payload, spec) => options.addJob(definedTask.taskIdentifier as string, payload, spec)
    const { helpers: defaultHelpers } = options
    if (defaultHelpers) {
      const baseRun = definedTask.run
      definedTask.run = (payload, helpers) =>
        baseRun(payload, ({
          defaultHelpers: manualHelpers,
          payload: runPayload,
          taskIdentifier: runTaskIdentifier,
        }) => {
          const configuredHelpers = resolveTaskHelpers(defaultHelpers, {
            defaultHelpers: manualHelpers,
            payload: runPayload,
            taskIdentifier: runTaskIdentifier,
          })

          return resolveTaskHelpers(helpers, {
            defaultHelpers: configuredHelpers,
            payload: runPayload,
            taskIdentifier: runTaskIdentifier,
          })
        })
    }
    return definedTask
  }
}
