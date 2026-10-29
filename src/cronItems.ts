import type { CronItem, ParsedCronItem, TaskList } from "graphile-worker"
import { parseCronItems } from "graphile-worker"

import type { AnyNamedTask, NamedTask, TaskJobPayload } from "./tasks"
import { createTaskList } from "./tasks"

/**
 * A graphile-worker cron item that holds the task it schedules instead of the task identifier,
 * with `payload` checked against the job payload of the task.
 *
 * For a union of tasks, it is a union of their cron items, so each task is checked against its own payload.
 * It is `never` when the given type is not an implemented task.
 */
// Infer the task identifier instead of checking it against `string`: TypeScript resolves a conditional type with type parameters only if it holds without their constraints,
// so the cron item of a task whose identifier is a type parameter of a generic function would stay unresolved and accept no value.
// The inferred identifier keeps the `string` constraint of NamedTask.
export type TaskCronItem<TTask> = TTask extends NamedTask<infer _TIdentifier, never>
  ? Omit<CronItem, "task" | "payload"> & {
    /**
     * Task to schedule, added to the task list together with the cron item.
     */
    task: TTask
  } & CronItemPayloadField<TaskJobPayload<TTask>>
  : never

/**
 * A cron item of any task, used as the element type for heterogeneous lists of cron items.
 */
export type AnyTaskCronItem = Omit<CronItem, "task"> & {
  /**
   * Task to schedule, added to the task list together with the cron item.
   */
  task: AnyNamedTask
}

// graphile-worker always passes the task an object with `_cron`:
// - an unknown or any payload accepts any cron item payload;
// - a void payload is ignored, so the task is scheduled without a payload, while undefined and never payloads cannot be scheduled;
// - otherwise the payload must satisfy the object part of the task payload, even when the task also accepts void,
//   and is required unless an empty object satisfies it.
type CronItemPayloadField<TJobPayload> = unknown extends TJobPayload
  ? { payload?: CronItem["payload"] }
  : [TJobPayload] extends [void]
      ? [void] extends [TJobPayload] ? { payload?: undefined } : { payload: never }
      : Record<never, never> extends CronItemPayload<TJobPayload>
        ? { payload?: CronItemPayload<TJobPayload> }
        : { payload: CronItemPayload<TJobPayload> }

// graphile-worker spreads the cron item payload into a plain object with `_cron`,
// so only plain object payloads can be scheduled, and `_cron` is not part of the cron item payload.
type CronItemPayload<TJobPayload> = TJobPayload extends readonly unknown[] | ((...args: never) => unknown)
  ? never
  : TJobPayload extends object
    ? Omit<TJobPayload, "_cron"> & object
    : never

// Like the built-in NoInfer, which would require TypeScript 5.4 to read the declarations: the indexed access defers evaluation of T.
type NoInference<T> = [T][T extends unknown ? 0 : never]

/**
 * Define a graphile-worker cron item that schedules the given task.
 *
 * It takes the fields of graphile-worker's `CronItem` with the task in place of its identifier.
 * The payload is checked against the job payload of the task, without the `_cron` field added by graphile-worker.
 */
export function defineCronItem<TTask extends { readonly taskIdentifier: string }>(
  // Infer the task only from `task`: inferring it through TaskCronItem would type the payload of a task defined inline as never, from the AnyNamedTask constraint.
  cronItem: { task: TTask } & NoInference<TaskCronItem<TTask>>,
): TaskCronItem<TTask> {
  return cronItem as TaskCronItem<TTask>
}

/**
 * Create the `taskList` and `parsedCronItems` options of graphile-worker's `run` from the given tasks and cron items.
 *
 * The task list includes the task of each cron item, so a cron item cannot be scheduled without its task.
 */
export function createRunnerOptions({ tasks = [], cronItems = [] }: {
  /**
   * Tasks to run, including tasks that are also scheduled.
   */
  tasks?: readonly AnyNamedTask[]
  /**
   * Cron items to schedule.
   */
  cronItems?: readonly AnyTaskCronItem[]
}): { taskList: TaskList, parsedCronItems: ParsedCronItem[] } {
  assertUniqueCronItemIdentifiers(cronItems)
  return {
    // A task can be both enqueued and scheduled, or scheduled by several cron items, so the same task is listed once.
    taskList: createTaskList([...new Set([...tasks, ...cronItems.map(cronItem => cronItem.task)])]),
    parsedCronItems: parseCronItems(cronItems.map(cronItem => ({ ...cronItem, task: cronItem.task.taskIdentifier }))),
  }
}

// graphile-worker keeps the schedule state by the cron item identifier, but parseCronItems does not check that identifiers are unique.
function assertUniqueCronItemIdentifiers(cronItems: readonly AnyTaskCronItem[]): void {
  const identifiers = new Set<string>()
  // Like graphile-worker, default the identifier to the task identifier.
  for (const { task, identifier = task.taskIdentifier } of cronItems) {
    if (identifiers.has(identifier)) {
      throw new Error(`Cron item identifiers must be unique: "${identifier}" is used more than once.`)
    }
    identifiers.add(identifier)
  }
}
