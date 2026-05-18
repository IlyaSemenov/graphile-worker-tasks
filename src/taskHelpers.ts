import type { JobHelpers } from "graphile-worker"

/**
 * Context passed to a TaskHelpers factory for a manual task run.
 */
export type TaskHelpersContext<TPayload = unknown> = {
  /**
   * Identifier of the task being run.
   */
  taskIdentifier: string
  /**
   * Payload passed to the manual run.
   */
  payload: TPayload
  /**
   * Default helpers for this manual run. Spread this object when overriding only selected helpers.
   */
  defaultHelpers: JobHelpers
}

/**
 * Helpers for a manual task run.
 *
 * Either a partial object shallow-merged onto the default manual helpers,
 * or a factory that receives the default helpers and returns the full helpers.
 */
export type TaskHelpers<TPayload = unknown> = Partial<JobHelpers> | ((context: TaskHelpersContext<TPayload>) => JobHelpers)

export function resolveTaskHelpers<TPayload>(
  helpers: TaskHelpers<TPayload> | undefined,
  context: TaskHelpersContext<TPayload>,
): JobHelpers {
  if (!helpers) {
    return context.defaultHelpers
  }
  if (typeof helpers === "function") {
    return helpers(context)
  }
  return { ...context.defaultHelpers, ...helpers }
}
