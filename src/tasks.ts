import type { JobHelpers, PromiseOrDirect, TaskList } from "graphile-worker"

// Copy the return type from the graphile-worker package.
// We should rather be using ReturnType<GraphileWorkerTask> here,
// but when using with conjunction with the GraphileWorkerTasks helper,
// it leads to error: Return type annotation circularly references itself.
type Task<TPayload> = (payload: TPayload, helpers: JobHelpers) => PromiseOrDirect<void | PromiseOrDirect<unknown>[]>

export type NamedTask<TName extends string, TPayload> = Task<TPayload> & {
  taskName: TName
}

/**
 * Define a graphile-worker task handler.
 */
export function defineTask<TName extends string, TPayload>(taskName: TName, task: Task<TPayload>): NamedTask<TName, TPayload> {
  const definedTask = task as NamedTask<TName, TPayload>
  definedTask.taskName = taskName
  return definedTask
}

/**
 * Merge lists of tasks into a single list.
 */
export function mergeTasks<T extends NamedTask<any, any>>(tasks: T[]): T[] {
  const taskNames = new Set(tasks.map(task => task.taskName))
  if (taskNames.size !== tasks.length) {
    throw new Error("Task names must be unique.")
  }
  return tasks
}

/**
 * Given a collection of tasks defined with defineTask,
 * create a TaskList object that can be used by graphile-worker.
 */
export function createTaskList(tasks: NamedTask<any, any>[]): TaskList {
  return Object.fromEntries(tasks.map(task => [task.taskName, task]))
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
  [K in TTasks[number]["taskName"]]: InferNamedTaskPayload<TTasks[number], K>
}

// Somehow this needs to be a separate type, it won't work if used literally in GraphileWorkerTasks.
type InferNamedTaskPayload<T extends NamedTask<any, any>, K extends string> = T extends NamedTask<K, infer Args> ? Args : never
