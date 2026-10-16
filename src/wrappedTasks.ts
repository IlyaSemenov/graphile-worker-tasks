import type { AddJobFunction, Job, TaskSpec } from "graphile-worker"

import type { BoundTaskDefinition } from "./boundTasks"
import type { NamedTask, Task, TaskDefinition } from "./tasks"

/**
 * Transforms that let a task definition take an inner payload while its jobs store a different job payload.
 */
export type TaskDefinitionWrapper<TPayload, TJobPayload> = {
  /**
   * Build the job payload from the payload passed to `addJob` or `run`.
   */
  encodePayload(payload: TPayload): TJobPayload
  /**
   * Transform the spec passed to `addJob`, given the job payload built for the same job.
   */
  encodeSpec?(spec: TaskSpec | undefined, jobPayload: TJobPayload): TaskSpec | undefined
  /**
   * Create the task function that receives the job payload from the one that receives the inner payload.
   */
  wrapTask(task: Task<TPayload>): Task<TJobPayload>
}

/**
 * A task definition whose task functions receive an inner payload while its jobs store the job payload.
 */
export type WrappedTaskDefinition<TIdentifier extends string, TPayload, TJobPayload> = {
  /**
   * Identifier used by graphile-worker to route jobs to this task.
   */
  readonly taskIdentifier: TIdentifier
  /**
   * Create a definition of the same task that enqueues jobs through the given addJob implementation.
   */
  withAddJob(addJob: AddJobFunction): BoundWrappedTaskDefinition<TIdentifier, TPayload, TJobPayload>
  /**
   * Create the task implementing this definition.
   */
  implement(task: Task<TPayload>): NamedTask<TIdentifier, TJobPayload, TPayload>
}

/**
 * A wrapped task definition bound to an addJob implementation.
 */
export type BoundWrappedTaskDefinition<TIdentifier extends string, TPayload, TJobPayload> = {
  /**
   * Identifier used by graphile-worker to route jobs to this task.
   */
  readonly taskIdentifier: TIdentifier
  /**
   * Enqueue this task with the job payload and spec built by the wrapper.
   */
  addJob(payload: TPayload, spec?: TaskSpec): Promise<Job>
  /**
   * Create the task implementing this definition, with the default helpers of the wrapped definition.
   */
  implement(task: Task<TPayload>): NamedTask<TIdentifier, TJobPayload, TPayload>
}

/**
 * Wrap a task definition so that `addJob` and the `run` of its tasks take an inner payload, and the task function passed to `implement` receives it.
 *
 * The wrapped definition keeps the task identifier and the job payload of the given definition.
 */
export function wrapTaskDefinition<TIdentifier extends string, TPayload, TJobPayload>(
  definition: BoundTaskDefinition<TIdentifier, TJobPayload>,
  wrapper: TaskDefinitionWrapper<TPayload, TJobPayload>,
): BoundWrappedTaskDefinition<TIdentifier, TPayload, TJobPayload>
export function wrapTaskDefinition<TIdentifier extends string, TPayload, TJobPayload>(
  definition: TaskDefinition<TIdentifier, TJobPayload>,
  wrapper: TaskDefinitionWrapper<TPayload, TJobPayload>,
): WrappedTaskDefinition<TIdentifier, TPayload, TJobPayload>
export function wrapTaskDefinition<TIdentifier extends string, TPayload, TJobPayload>(
  definition: BoundTaskDefinition<TIdentifier, TJobPayload> | TaskDefinition<TIdentifier, TJobPayload>,
  wrapper: TaskDefinitionWrapper<TPayload, TJobPayload>,
): BoundWrappedTaskDefinition<TIdentifier, TPayload, TJobPayload> | WrappedTaskDefinition<TIdentifier, TPayload, TJobPayload> {
  // Build on the public interface of the given definition, so its addJob binding and default helpers apply unchanged.
  const implement = (task: Task<TPayload>) => {
    const namedTask = definition.implement(wrapper.wrapTask(task))
    const runJob = namedTask.run
    const wrappedTask = namedTask as unknown as NamedTask<TIdentifier, TJobPayload, TPayload>
    // Like addJob, run takes the inner payload and builds the job payload in the current context.
    wrappedTask.run = (payload, helpers) => runJob(wrapper.encodePayload(payload), helpers)
    return wrappedTask
  }

  if ("addJob" in definition) {
    return {
      taskIdentifier: definition.taskIdentifier,
      addJob(payload, spec) {
        const jobPayload = wrapper.encodePayload(payload)
        return definition.addJob(jobPayload, wrapper.encodeSpec ? wrapper.encodeSpec(spec, jobPayload) : spec)
      },
      implement,
    }
  }

  return {
    taskIdentifier: definition.taskIdentifier,
    withAddJob: addJob => wrapTaskDefinition(definition.withAddJob(addJob), wrapper),
    implement,
  }
}

/**
 * Prefix the job key and the queue name of the given spec, when they are not empty.
 */
export function prefixTaskSpec(spec: TaskSpec, prefix: string): TaskSpec
export function prefixTaskSpec(spec: TaskSpec | undefined, prefix: string): TaskSpec | undefined
export function prefixTaskSpec(spec: TaskSpec | undefined, prefix: string): TaskSpec | undefined {
  if (!spec) {
    return spec
  }
  const { jobKey, queueName } = spec
  // graphile-worker treats an empty job key or queue name as none, so they stay unprefixed.
  return {
    ...spec,
    ...(jobKey ? { jobKey: `${prefix}${jobKey}` } : undefined),
    ...(queueName ? { queueName: `${prefix}${queueName}` } : undefined),
  }
}
