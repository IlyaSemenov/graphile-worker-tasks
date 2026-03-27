import type { JobHelpers, PromiseOrDirect, TaskList } from "graphile-worker"

// Copy the return type from the graphile-worker package.
// We should rather be using ReturnType<GraphileWorkerTask> here,
// but when used in conjunction with the GraphileWorkerTasks helper,
// it leads to an error: Return type annotation circularly references itself.
export type Task<TPayload> = (payload: TPayload, helpers: JobHelpers) => PromiseOrDirect<void | PromiseOrDirect<unknown>[]>

export type NamedTask<TIdentifier extends string, TPayload> = Task<TPayload> & {
  taskIdentifier: TIdentifier
}

/**
 * Define a graphile-worker task handler.
 */
export function defineTask<TIdentifier extends string, TPayload>(taskIdentifier: TIdentifier, task: Task<TPayload>): NamedTask<TIdentifier, TPayload> {
  const definedTask = task as NamedTask<TIdentifier, TPayload>
  definedTask.taskIdentifier = taskIdentifier
  return definedTask
}

/**
 * Merge lists of tasks into a single list.
 */
export function mergeTasks<T extends NamedTask<any, any>>(tasks: T[]): T[] {
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
export function createTaskList(tasks: NamedTask<any, any>[]): TaskList {
  return Object.fromEntries(tasks.map(task => [task.taskIdentifier, task]))
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
export type GraphileWorkerTasks<TTasks extends NamedTask<any, any>[]> = {
  [K in TTasks[number]["taskIdentifier"]]: InferNamedTaskPayload<TTasks[number], K>
}

// Somehow this needs to be a separate type, it won't work if used literally in GraphileWorkerTasks.
type InferNamedTaskPayload<T extends NamedTask<any, any>, K extends string> = T extends NamedTask<K, infer Args> ? Args : never
