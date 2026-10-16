import { describe, expect, test } from "bun:test"
import type { JobHelpers } from "graphile-worker"

import { runTask } from "./run"
import { defineTask } from "./tasks"

// graphile-worker's helpers.query has a strict pg signature; tests only need a stub.
const stubQuery = (async () => []) as unknown as JobHelpers["query"]

describe("task.run", () => {
  test("runs with default helpers", () => {
    const calls: unknown[][] = []
    const task = defineTask("task1", (_payload: { foo: string }, helpers) => {
      helpers.logger.debug("manual run")
      calls.push([helpers.job.task_identifier, helpers.job.payload])
    })

    expect(task.run({ foo: "bar" })).toBeUndefined()
    expect(calls).toEqual([["task1", { foo: "bar" }]])
  })

  test("patches default helpers with a partial object", async () => {
    const calls: unknown[][] = []
    const task = defineTask("task1", async (_payload: { foo: string }, helpers) => {
      await helpers.query("select 1")
      calls.push([helpers.job.task_identifier, helpers.query])
    })

    await task.run({ foo: "bar" }, { query: stubQuery })

    expect(calls).toEqual([["task1", stubQuery]])
  })

  test("replaces helpers with a factory", async () => {
    const seen: unknown[][] = []
    const task = defineTask("task1", async (_payload: { foo: string }, helpers) => {
      await helpers.query("select 1")
    })

    await task.run({ foo: "bar" }, ({ defaultHelpers, payload, taskIdentifier }) => {
      seen.push([taskIdentifier, payload, defaultHelpers.job.id])
      return { ...defaultHelpers, query: stubQuery }
    })

    expect(seen).toEqual([["task1", { foo: "bar" }, "manual:task1"]])
  })

  test("throws for worker runtime dependencies in default helpers", async () => {
    const task = defineTask("task1", async (_payload: { foo: string }, helpers) => {
      await helpers.query("select 1")
    })

    await expect(task.run({ foo: "bar" })).rejects.toThrow("Cannot use helpers.query during manual task run.")
  })

  describe("abort helpers", () => {
    test("derives abortPromise from a passed abortSignal", async () => {
      const controller = new AbortController()
      const abortPromises: Promise<void>[] = []
      const task = defineTask("task1", (_payload: { foo: string }, helpers) => {
        abortPromises.push(helpers.abortPromise)
      })

      const reason = new Error("stop")
      task.run({ foo: "bar" }, { abortSignal: controller.signal })
      controller.abort(reason)

      await expect(abortPromises[0]!).rejects.toBe(reason)
    })

    test("coerces a non-Error abort reason to an Error", async () => {
      const controller = new AbortController()
      const abortPromises: Promise<void>[] = []
      const task = defineTask("task1", (_payload: { foo: string }, helpers) => {
        abortPromises.push(helpers.abortPromise)
      })

      task.run({ foo: "bar" }, { abortSignal: controller.signal })
      controller.abort("stop")

      const error = await abortPromises[0]!.catch((error: unknown) => error)
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).cause).toBe("stop")
    })

    test("rejects derived abortPromise for an already aborted signal", async () => {
      const abortPromises: Promise<void>[] = []
      const task = defineTask("task1", (_payload: { foo: string }, helpers) => {
        abortPromises.push(helpers.abortPromise)
      })

      const reason = new Error("stopped")
      task.run({ foo: "bar" }, { abortSignal: AbortSignal.abort(reason) })

      await expect(abortPromises[0]!).rejects.toBe(reason)
    })

    test("keeps an explicitly passed abortPromise", () => {
      const abortPromise = new Promise<void>(() => {})
      const abortPromises: Promise<void>[] = []
      const task = defineTask("task1", (_payload: { foo: string }, helpers) => {
        abortPromises.push(helpers.abortPromise)
      })

      task.run({ foo: "bar" }, { abortSignal: new AbortController().signal, abortPromise })

      expect(abortPromises[0]).toBe(abortPromise)
    })

    test("does not report an ignored derived abortPromise as unhandled", async () => {
      const controller = new AbortController()
      const unhandled: unknown[] = []
      const onUnhandledRejection = (reason: unknown) => {
        unhandled.push(reason)
      }
      const task = defineTask("task1", (_payload: { foo: string }) => {})

      process.on("unhandledRejection", onUnhandledRejection)
      try {
        task.run({ foo: "bar" }, { abortSignal: controller.signal })
        controller.abort("stop")
        await new Promise(resolve => setTimeout(resolve, 0))
      } finally {
        process.off("unhandledRejection", onUnhandledRejection)
      }

      expect(unhandled).toEqual([])
    })
  })

  test("provides a non-aborted signal in default helpers", () => {
    const aborted: boolean[] = []
    const task = defineTask("task1", (_payload: { foo: string }, helpers) => {
      aborted.push(helpers.abortSignal.aborted)
    })

    task.run({ foo: "bar" })

    expect(aborted).toEqual([false])
  })
})

test("runTask runs a bare task handler", async () => {
  const calls: unknown[][] = []
  await runTask(async (payload: { foo: string }, helpers) => {
    calls.push([payload, helpers.job.task_identifier])
  }, "task1", { foo: "bar" })

  expect(calls).toEqual([[{ foo: "bar" }, "task1"]])
})
