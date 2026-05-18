import type { JobHelpers } from "graphile-worker"
import { describe, expect, test } from "vitest"

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
})

test("runTask runs a bare task handler", async () => {
  const calls: unknown[][] = []
  await runTask(async (payload: { foo: string }, helpers) => {
    calls.push([payload, helpers.job.task_identifier])
  }, "task1", { foo: "bar" })

  expect(calls).toEqual([[{ foo: "bar" }, "task1"]])
})
