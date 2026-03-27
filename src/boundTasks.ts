import type { AddJobFunction, Job, TaskSpec } from "graphile-worker"

import type { NamedTask, Task } from "./tasks"
import { defineTask } from "./tasks"

export type BoundNamedTask<TIdentifier extends string, TPayload> = NamedTask<TIdentifier, TPayload> & {
  addJob(payload: TPayload, spec?: TaskSpec): Promise<Job>
}

/**
 * Create a defineTask function bound to an addJob implementation.
 */
export function createDefineTask(options: { addJob: AddJobFunction }) {
  return function defineBoundNamedTask<TIdentifier extends string, TPayload>(
    taskIdentifier: TIdentifier,
    task: Task<TPayload>,
  ): BoundNamedTask<TIdentifier, TPayload> {
    const definedTask = defineTask(taskIdentifier, task) as BoundNamedTask<TIdentifier, TPayload>
    definedTask.addJob = (payload, spec) => options.addJob(definedTask.taskIdentifier as string, payload, spec)
    return definedTask
  }
}
