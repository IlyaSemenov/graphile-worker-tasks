import type { AddJobFunction, Job, TaskSpec } from "graphile-worker"

import { bindNamedTask, createBoundTaskDefinition, nameTask } from "./taskFactories"
import type { TaskHelpers } from "./taskHelpers"
import type { NamedTask, Task } from "./tasks"

/**
 * A named task with helpers for enqueueing and manually running itself.
 */
export type BoundNamedTask<TIdentifier extends string, TPayload> = NamedTask<TIdentifier, TPayload> & {
  /**
   * Enqueue this task through the bound addJob implementation.
   */
  addJob(payload: TPayload, spec?: TaskSpec): Promise<Job>
}

/**
 * A task definition bound to an addJob implementation, able to enqueue jobs without an implementation.
 */
export type BoundTaskDefinition<TIdentifier extends string, TPayload> = {
  /**
   * Identifier used by graphile-worker to route jobs to this task.
   */
  readonly taskIdentifier: TIdentifier
  /**
   * Enqueue this task through the bound addJob implementation.
   */
  addJob(payload: TPayload, spec?: TaskSpec): Promise<Job>
  /**
   * Create a bound definition of the same task with the given payload type.
   */
  withPayload<TNewPayload>(): BoundTaskDefinition<TIdentifier, TNewPayload>
  /**
   * Create the task implementing this definition, bound to the same addJob implementation and createDefineTask helpers.
   */
  implement(task: Task<TPayload>): BoundNamedTask<TIdentifier, TPayload>
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
  // Keep the two-argument overload last: Parameters and ReturnType of an overloaded function resolve to its last signature.
  function defineBoundNamedTask<TIdentifier extends string>(taskIdentifier: TIdentifier): BoundTaskDefinition<TIdentifier, unknown>
  function defineBoundNamedTask<TIdentifier extends string, TPayload>(taskIdentifier: TIdentifier, task: Task<TPayload>): BoundNamedTask<TIdentifier, TPayload>
  function defineBoundNamedTask<TIdentifier extends string, TPayload>(
    taskIdentifier: TIdentifier,
    task?: Task<TPayload>,
  ): BoundTaskDefinition<TIdentifier, unknown> | BoundNamedTask<TIdentifier, TPayload> {
    return task ? bindNamedTask(nameTask(task, taskIdentifier), options) : createBoundTaskDefinition(taskIdentifier, options)
  }
  return defineBoundNamedTask
}
