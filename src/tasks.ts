import type { TaskList } from "graphile-worker"

export type TaskKey = keyof GraphileWorker.Tasks

export type Task<T extends TaskKey> = Exclude<TaskList[T], undefined>

export type DefinedTask<T extends TaskKey = TaskKey> = Task<T> & {
  taskName: T
}

/**
 * Define a graphile-worker task handler.
 */
export function defineTask<T extends TaskKey>(name: T, task: Task<T>): DefinedTask<T> {
  const definedTask = task as DefinedTask<T>
  definedTask.taskName = name
  return definedTask
}

/**
 * Given a collection of tasks defined with defineTask,
 * create a TaskList object that can be used by graphile-worker.
 */
export function createTaskList(tasks: DefinedTask<TaskKey>[] | Record<any, DefinedTask<TaskKey>>): TaskList {
  const namedTaskList = Array.isArray(tasks) ? tasks : Object.values(tasks)
  return Object.fromEntries(namedTaskList.map(task => [task.taskName, task]))
}
