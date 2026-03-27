import type { AddJobFunction, Job } from "graphile-worker"
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

  test("creates tasks compatible with task collection helpers", () => {
    const addJob: AddJobFunction = async () => makeJob()
    const defineBoundNamedTask = createDefineTask({ addJob })
    const task1 = defineBoundNamedTask("task1", () => {})
    const task2 = defineBoundNamedTask("task2", () => {})

    expect(mergeTasks([task1, task2])).toEqual([task1, task2])
    expect(createTaskList([task1, task2])).toEqual({ task1, task2 })
  })
})
