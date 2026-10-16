import type { BoundNamedTask, BoundTaskDefinition, CreateDefineTaskOptions } from "./boundTasks"
import { runTask } from "./run"
import { resolveTaskHelpers } from "./taskHelpers"
import type { NamedTask, Task, TaskDefinition } from "./tasks"

/**
 * Create a task definition without an addJob implementation.
 */
export function createTaskDefinition<TIdentifier extends string, TPayload>(taskIdentifier: TIdentifier): TaskDefinition<TIdentifier, TPayload> {
  return {
    taskIdentifier,
    withPayload: <TNewPayload>() => createTaskDefinition<TIdentifier, TNewPayload>(taskIdentifier),
    withAddJob: addJob => createBoundTaskDefinition(taskIdentifier, { addJob }),
    implement: task => nameTask(wrapTask(task), taskIdentifier),
  }
}

/**
 * Create a task definition bound to an addJob implementation and, optionally, default helpers for the run of its tasks.
 */
export function createBoundTaskDefinition<TIdentifier extends string, TPayload>(
  taskIdentifier: TIdentifier,
  options: CreateDefineTaskOptions,
): BoundTaskDefinition<TIdentifier, TPayload> {
  return {
    taskIdentifier,
    addJob: (payload, spec) => options.addJob(taskIdentifier as string, payload, spec),
    withPayload: <TNewPayload>() => createBoundTaskDefinition<TIdentifier, TNewPayload>(taskIdentifier, options),
    implement: task => bindNamedTask(nameTask(wrapTask(task), taskIdentifier), options),
  }
}

// Implementations name a wrapper rather than the task function, so implementing several definitions with one function keeps their metadata apart.
function wrapTask<TPayload>(task: Task<TPayload>): Task<TPayload> {
  return (payload, helpers) => task(payload, helpers)
}

/**
 * Attach the task identifier and `run` to the given task function, mutating and returning it.
 */
export function nameTask<TIdentifier extends string, TPayload>(task: Task<TPayload>, taskIdentifier: TIdentifier): NamedTask<TIdentifier, TPayload> {
  const namedTask = task as NamedTask<TIdentifier, TPayload>
  namedTask.taskIdentifier = taskIdentifier
  namedTask.run = (payload, helpers) => runTask(namedTask, taskIdentifier, payload, helpers)
  return namedTask
}

/**
 * Attach addJob to the given task and apply the configured helpers to its run, mutating and returning it.
 */
export function bindNamedTask<TIdentifier extends string, TPayload>(
  task: NamedTask<TIdentifier, TPayload>,
  options: CreateDefineTaskOptions,
): BoundNamedTask<TIdentifier, TPayload> {
  const boundTask = task as BoundNamedTask<TIdentifier, TPayload>
  boundTask.addJob = (payload, spec) => options.addJob(boundTask.taskIdentifier as string, payload, spec)
  const { helpers: defaultHelpers } = options
  if (defaultHelpers) {
    const baseRun = boundTask.run
    boundTask.run = (payload, helpers) =>
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
  return boundTask
}
