import type { AddJobFunction, JobHelpers, PromiseOrDirect, TaskList } from "graphile-worker"

import type { BoundTaskDefinition } from "./boundTasks"
import { createTaskDefinition, nameTask } from "./taskFactories"
import type { TaskHelpers } from "./taskHelpers"

// Copy the return type from the graphile-worker package.
// We should rather be using ReturnType<GraphileWorkerTask> here,
// but when used in conjunction with the GraphileWorkerTasks helper,
// it leads to an error: Return type annotation circularly references itself.
/**
 * The value a graphile-worker task function may return.
 */
export type TaskResult = PromiseOrDirect<void | PromiseOrDirect<unknown>[]>

/**
 * A graphile-worker task function with a typed payload.
 */
export type Task<TPayload> = (payload: TPayload, helpers: JobHelpers) => TaskResult

/**
 * A task function annotated with the graphile-worker task identifier it handles.
 */
export type NamedTask<TIdentifier extends string, TPayload> = Task<TPayload> & {
  /**
   * Identifier used by graphile-worker to route jobs to this task.
   */
  taskIdentifier: TIdentifier
  /**
   * Run this task directly with the default manual helpers, optionally patched or replaced by the provided helpers.
   */
  run(payload: TPayload, helpers?: TaskHelpers<TPayload>): TaskResult
}

/**
 * A NamedTask with its payload type erased to `never`, the only sound choice
 * given that TPayload sits in a contravariant position (the task's call
 * signature and its `run` method parameter). Used as the element type for
 * heterogeneous lists of tasks, where each task has its own payload type.
 */
export type AnyNamedTask = NamedTask<string, never>

/**
 * A graphile-worker task contract: the task identifier and its payload type, without an implementation.
 *
 * Producers can import a definition to enqueue jobs without loading its implementation and dependencies.
 */
export type TaskDefinition<TIdentifier extends string, TPayload> = {
  /**
   * Identifier used by graphile-worker to route jobs to this task.
   */
  readonly taskIdentifier: TIdentifier
  /**
   * Create a definition of the same task with the given payload type.
   */
  withPayload<TNewPayload>(): TaskDefinition<TIdentifier, TNewPayload>
  /**
   * Create a definition of the same task that enqueues jobs through the given addJob implementation.
   *
   * The original definition stays unbound, so it can be bound to several addJob implementations.
   */
  withAddJob(addJob: AddJobFunction): BoundTaskDefinition<TIdentifier, TPayload>
  /**
   * Create the task implementing this definition.
   */
  implement(task: Task<TPayload>): NamedTask<TIdentifier, TPayload>
}

// Keep the two-argument overload last: Parameters and ReturnType of an overloaded function resolve to its last signature.
/**
 * Define a graphile-worker task contract without an implementation.
 *
 * Its payload type is `unknown` until set with `withPayload`.
 */
export function defineTask<TIdentifier extends string>(taskIdentifier: TIdentifier): TaskDefinition<TIdentifier, unknown>
/**
 * Define a graphile-worker task from its task function.
 */
export function defineTask<TIdentifier extends string, TPayload>(taskIdentifier: TIdentifier, task: Task<TPayload>): NamedTask<TIdentifier, TPayload>
export function defineTask<TIdentifier extends string, TPayload>(
  taskIdentifier: TIdentifier,
  task?: Task<TPayload>,
): TaskDefinition<TIdentifier, TPayload> | NamedTask<TIdentifier, TPayload> {
  return task ? nameTask(task, taskIdentifier) : createTaskDefinition(taskIdentifier)
}

/**
 * Merge lists of tasks into a single list.
 */
export function mergeTasks<T extends AnyNamedTask>(tasks: T[]): T[] {
  const taskIdentifiers = new Set(tasks.map(task => task.taskIdentifier))
  if (taskIdentifiers.size !== tasks.length) {
    throw new Error("Task identifiers must be unique.")
  }
  return tasks
}

/**
 * Given a collection of tasks defined with defineTask,
 * create a TaskList object that can be used by graphile-worker.
 */
export function createTaskList(tasks: AnyNamedTask[]): TaskList {
  for (const task of tasks) {
    // A task definition reaching here (e.g. from untyped code) has no task function for graphile-worker to call.
    if (typeof task !== "function") {
      throw new TypeError(`Task "${(task as { taskIdentifier?: unknown }).taskIdentifier}" is not implemented. Pass the task returned by implement() instead of its definition.`)
    }
  }
  // AnyNamedTask erases the payload to `never` so heterogeneous task lists type-check;
  // that makes it unassignable to TaskList's `Task<any>` value type (payload `unknown`), hence the cast.
  return Object.fromEntries(tasks.map(task => [task.taskIdentifier, task])) as unknown as TaskList
}

/**
 * Usage:
 *
 * ```ts
 * const tasks = mergeTasks(
 *   defineTask(...),
 *   defineTask(...),
 * )
 *
 * declare global {
 *   namespace GraphileWorker {
 *     interface Tasks extends GraphileWorkerTasks<typeof tasks> {}
 *   }
 * }
 * ```
 */
export type GraphileWorkerTasks<TTasks extends AnyNamedTask[]> = {
  [K in TTasks[number]["taskIdentifier"]]: InferNamedTaskPayload<TTasks[number], K>
}

// Somehow this needs to be a separate type, it won't work if used literally in GraphileWorkerTasks.
type InferNamedTaskPayload<T extends AnyNamedTask, K extends string> = T extends NamedTask<K, infer Args> ? Args : never
