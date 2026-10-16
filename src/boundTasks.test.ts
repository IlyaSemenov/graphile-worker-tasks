import { describe, expect, test } from "bun:test"
import type { AddJobFunction, Job, JobHelpers } from "graphile-worker"

import { createDefineTask } from "./boundTasks"
import { createTaskList, mergeTasks } from "./tasks"

function makeJob(): Job {
  return { id: "job1" } as Job
}

describe("createDefineTask", () => {
  test("binds addJob using task identifier", async () => {
    const job = makeJob()
    const calls: unknown[][] = []
    const addJob: AddJobFunction = async (identifier, payload, spec) => {
      calls.push([identifier, payload, spec])
      return job
    }
    const defineBoundNamedTask = createDefineTask({ addJob })
    const task = defineBoundNamedTask("task1", async (_payload: { foo: string }) => {})
    const spec = { queueName: "serial", priority: 1 }

    expect(task.taskIdentifier).toBe("task1")
    await expect(task.addJob({ foo: "bar" }, spec)).resolves.toBe(job)
    expect(calls).toEqual([["task1", { foo: "bar" }, spec]])
  })

  describe("helpers option", () => {
    test("applies the configured factory helpers", async () => {
      const addJob: AddJobFunction = async () => makeJob()
      const marker = { marker: "helpers" } as unknown as JobHelpers
      const helperCalls: unknown[][] = []
      const runCalls: unknown[][] = []
      const defineBoundNamedTask = createDefineTask({
        addJob,
        helpers: ({ defaultHelpers, payload, taskIdentifier }) => {
          helperCalls.push([taskIdentifier, payload, defaultHelpers.job.payload])
          return {
            ...defaultHelpers,
            ...marker,
          }
        },
      })
      const task = defineBoundNamedTask("task1", async (payload: { foo: string }, taskHelpers) => {
        runCalls.push([payload, taskHelpers])
      })

      await task.run({ foo: "bar" })

      expect(helperCalls).toEqual([["task1", { foo: "bar" }, { foo: "bar" }]])
      expect(runCalls).toEqual([[{ foo: "bar" }, expect.objectContaining(marker)]])
    })

    test("applies the configured partial helpers onto the defaults", async () => {
      const addJob: AddJobFunction = async () => makeJob()
      const query = (async () => []) as unknown as JobHelpers["query"]
      const defineBoundNamedTask = createDefineTask({ addJob, helpers: { query } })
      const calls: unknown[][] = []
      const task = defineBoundNamedTask("task1", async (_payload: { foo: string }, helpers) => {
        await helpers.query("select 1")
        calls.push([helpers.job.task_identifier, helpers.query])
      })

      await task.run({ foo: "bar" })

      expect(calls).toEqual([["task1", query]])
    })

    test("per-call helpers override the configured helpers", async () => {
      const addJob: AddJobFunction = async () => makeJob()
      const configuredQuery = (async () => []) as unknown as JobHelpers["query"]
      const perCallQuery = (async () => []) as unknown as JobHelpers["query"]
      const withPgClient = (async () => undefined) as unknown as JobHelpers["withPgClient"]
      const defineBoundNamedTask = createDefineTask({ addJob, helpers: { query: configuredQuery, withPgClient } })
      const seen: unknown[][] = []
      const task = defineBoundNamedTask("task1", async (_payload: { foo: string }, helpers) => {
        seen.push([helpers.query, helpers.withPgClient])
      })

      await task.run({ foo: "bar" }, { query: perCallQuery })

      expect(seen).toEqual([[perCallQuery, withPgClient]])
    })

    describe("abort helpers", () => {
      test("reuses one abortPromise for a configured abortSignal across runs", () => {
        const addJob: AddJobFunction = async () => makeJob()
        const defineBoundNamedTask = createDefineTask({ addJob, helpers: { abortSignal: new AbortController().signal } })
        const abortPromises: Promise<void>[] = []
        const task = defineBoundNamedTask("task1", (_payload: { foo: string }, helpers) => {
          abortPromises.push(helpers.abortPromise)
        })

        task.run({ foo: "bar" })
        task.run({ foo: "bar" })

        expect(abortPromises[0]).toBe(abortPromises[1]!)
      })

      test("keeps a per-call abortPromise over a configured abortSignal", () => {
        const addJob: AddJobFunction = async () => makeJob()
        const defineBoundNamedTask = createDefineTask({ addJob, helpers: { abortSignal: new AbortController().signal } })
        const perCallAbortPromise = new Promise<void>(() => {})
        const abortPromises: Promise<void>[] = []
        const task = defineBoundNamedTask("task1", (_payload: { foo: string }, helpers) => {
          abortPromises.push(helpers.abortPromise)
        })

        task.run({ foo: "bar" }, { abortPromise: perCallAbortPromise })

        expect(abortPromises[0]).toBe(perCallAbortPromise)
      })

      test("derives abortPromise from a per-call abortSignal over a configured one", async () => {
        const addJob: AddJobFunction = async () => makeJob()
        const configuredController = new AbortController()
        const perCallController = new AbortController()
        const defineBoundNamedTask = createDefineTask({ addJob, helpers: { abortSignal: configuredController.signal } })
        const abortPromises: Promise<void>[] = []
        const task = defineBoundNamedTask("task1", (_payload: { foo: string }, helpers) => {
          abortPromises.push(helpers.abortPromise)
        })

        task.run({ foo: "bar" }, { abortSignal: perCallController.signal })
        configuredController.abort(new Error("configured"))
        const pending = Symbol("pending")

        await expect(Promise.race([abortPromises[0]!, Promise.resolve(pending)])).resolves.toBe(pending)
        const perCallReason = new Error("per-call")
        perCallController.abort(perCallReason)
        await expect(abortPromises[0]!).rejects.toBe(perCallReason)
      })
    })
  })

  test("creates tasks compatible with task collection helpers", () => {
    const addJob: AddJobFunction = async () => makeJob()
    const defineBoundNamedTask = createDefineTask({ addJob })
    const task1 = defineBoundNamedTask("task1", () => {})
    const task2 = defineBoundNamedTask("task2", () => {})

    expect(mergeTasks([task1, task2])).toEqual([task1, task2])
    expect(createTaskList([task1, task2])).toEqual({ task1, task2 })
  })
})
