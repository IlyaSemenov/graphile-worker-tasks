import type { AddJobFunction, Job, JobHelpers } from "graphile-worker"
import { describe, expect, test } from "vitest"

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
