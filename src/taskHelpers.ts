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
 *
 * A partial object with `abortSignal` but without `abortPromise` also replaces the inherited `abortPromise` with one that rejects when the signal aborts, as in a worker run.
 * A factory must keep `abortSignal` and `abortPromise` consistent itself.
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
  const resolvedHelpers = { ...context.defaultHelpers, ...helpers }
  if (helpers.abortSignal && !helpers.abortPromise) {
    resolvedHelpers.abortPromise = getAbortPromise(helpers.abortSignal)
  }
  return resolvedHelpers
}

const abortPromises = new WeakMap<AbortSignal, Promise<void>>()

/**
 * Get a promise that rejects with the signal's reason, coerced to an Error like graphile-worker does, when the signal aborts.
 *
 * Caches one promise per signal, so repeated runs sharing a signal do not accumulate abort listeners.
 */
function getAbortPromise(signal: AbortSignal): Promise<void> {
  let abortPromise = abortPromises.get(signal)
  if (!abortPromise) {
    abortPromise = new Promise((_resolve, reject) => {
      if (signal.aborted) {
        reject(coerceError(signal.reason))
      } else {
        signal.addEventListener("abort", () => reject(coerceError(signal.reason)), { once: true })
      }
    })
    // Tasks may ignore abortPromise, so its rejection must not be reported as unhandled.
    abortPromise.catch(() => {})
    abortPromises.set(signal, abortPromise)
  }
  return abortPromise
}

/**
 * Return the given value if it is an Error, or wrap it in an Error with the value as its cause.
 *
 * Mirrors graphile-worker's internal coerceError, which it applies to the abort reason of a worker run.
 */
function coerceError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : "An error occurred"
  return new Error(message, { cause: error })
}
