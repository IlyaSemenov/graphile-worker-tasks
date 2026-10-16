import type { AddJobFunction, Job, TaskSpec } from "graphile-worker"

import type { TaskJobPayload } from "./tasks"

/**
 * A job enqueued through the `addJob` of {@link TestJobs}.
 */
export type TestJobCall<TPayload = unknown> = {
  identifier: string
  payload: TPayload
  spec?: TaskSpec
}

/**
 * A recorder of enqueued jobs for tests.
 */
export type TestJobs = {
  /**
   * `addJob` implementation that records the job instead of writing it to the database.
   */
  readonly addJob: AddJobFunction
  /**
   * All recorded jobs, in the order they were enqueued.
   */
  readonly calls: readonly TestJobCall[]
  /**
   * Forget all recorded jobs.
   *
   * Jobs captured by a running {@link TestJobs.capture} stay in its result.
   */
  clear(): void
  /**
   * Run the action and return queries over the jobs enqueued while it runs, along with its result.
   *
   * Jobs enqueued by fixtures and earlier steps stay out of the queries.
   * Nested and concurrent captures each include every job enqueued while they run.
   */
  capture<TResult>(action: () => TResult | Promise<TResult>): Promise<TestJobQueries<TResult>>
}

/**
 * Queries over the jobs enqueued during {@link TestJobs.capture}.
 */
export type TestJobQueries<TResult = unknown> = {
  /**
   * The captured jobs, in the order they were enqueued.
   */
  readonly calls: readonly TestJobCall[]
  /**
   * The value returned by the captured action.
   */
  readonly result: TResult
  /**
   * The captured jobs of the given task definition or task, with the job payload.
   */
  callsFor<T extends { readonly taskIdentifier: string }>(definition: T): TestJobCall<TaskJobPayload<T>>[]
  /**
   * The job payloads of the captured jobs of the given task definition or task.
   */
  payloadsFor<T extends { readonly taskIdentifier: string }>(definition: T): TaskJobPayload<T>[]
}

/**
 * Create a recorder of enqueued jobs for tests.
 */
export function createTestJobs(): TestJobs {
  const calls: TestJobCall[] = []
  const captures = new Set<TestJobCall[]>()
  let lastJobId = 0

  const addJob: AddJobFunction = async (identifier, payload, spec) => {
    const call: TestJobCall = { identifier, payload, spec }
    calls.push(call)
    for (const captured of captures) {
      captured.push(call)
    }
    return createJob(String(++lastJobId), call)
  }

  return {
    addJob,
    calls,
    clear() {
      calls.length = 0
    },
    async capture(action) {
      const captured: TestJobCall[] = []
      captures.add(captured)
      try {
        const result = await action()
        return createTestJobQueries(captured, result)
      } finally {
        captures.delete(captured)
      }
    },
  }
}

function createTestJobQueries<TResult>(calls: TestJobCall[], result: TResult): TestJobQueries<TResult> {
  const callsFor = <T extends { readonly taskIdentifier: string }>(definition: T) =>
    calls.filter(call => call.identifier === definition.taskIdentifier) as TestJobCall<TaskJobPayload<T>>[]
  return {
    calls,
    result,
    callsFor,
    payloadsFor: definition => callsFor(definition).map(call => call.payload),
  }
}

/**
 * Build the job that the database would return for the recorded call.
 *
 * Fields assigned by the database get placeholder values.
 */
function createJob(id: string, { identifier, payload, spec }: TestJobCall): Job {
  const now = new Date()
  return {
    id,
    job_queue_id: null,
    task_id: 0,
    task_identifier: identifier,
    // graphile-worker stores an empty object for a missing payload.
    payload: payload ?? {},
    // graphile-worker treats empty and zero spec values as unset.
    priority: spec?.priority || 0,
    run_at: spec?.runAt ?? now,
    attempts: 0,
    max_attempts: spec?.maxAttempts || 25,
    last_error: null,
    created_at: now,
    updated_at: now,
    key: spec?.jobKey || null,
    revision: 0,
    locked_at: null,
    locked_by: null,
    flags: spec?.flags?.length ? Object.fromEntries(spec.flags.map(flag => [flag, true] as const)) : null,
    is_available: true,
  }
}
