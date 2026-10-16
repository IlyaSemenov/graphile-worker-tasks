import { describe, expect, test } from "bun:test"
import type { JobHelpers } from "graphile-worker"

import type { AnyNamedTask } from "./tasks"
import { createTaskList, defineTask, mergeTasks } from "./tasks"

describe("mergeTasks", () => {
  const task1 = defineTask("task1", () => {})
  const task2 = defineTask("task2", () => {})
  const task3 = defineTask("task2", () => {}) // Duplicate task identifier

  test("merge tasks", () => {
    expect(mergeTasks([task1, task2])).toEqual([task1, task2])
  })

  test("merge tasks with duplicate identifiers", () => {
    expect(() => mergeTasks([task1, task2, task3])).toThrow("Task identifiers must be unique.")
  })
})

describe("createTaskList", () => {
  test("maps task identifiers to tasks", () => {
    const task1 = defineTask("task1", () => {})
    const task2 = defineTask("task2").implement(() => {})

    expect(createTaskList([task1, task2])).toEqual({ task1, task2 })
  })

  test("rejects duplicate task identifiers", () => {
    const definition = defineTask("task1")

    expect(() => createTaskList([definition.implement(() => {}), definition.implement(() => {})])).toThrow("Task identifiers must be unique.")
  })

  test("rejects an unimplemented task definition", () => {
    const definition = defineTask("task1")

    expect(() => createTaskList([definition as unknown as AnyNamedTask])).toThrow(
      `Task "task1" is not implemented. Pass the task returned by implement() instead of its definition.`,
    )
  })
})

test("defineTask returns a plain named task", () => {
  const taskFunction = () => {}
  const task = defineTask("task1", taskFunction)

  expect<unknown>(task).toBe(taskFunction)
  expect(task.taskIdentifier).toBe("task1")
  expect("addJob" in task).toBe(false)
})

describe("task definition", () => {
  test("is created without an implementation", () => {
    const definition = defineTask("task1")

    expect(definition.taskIdentifier).toBe("task1")
    expect(typeof definition).toBe("object")
    expect("run" in definition).toBe(false)
  })

  test("withPayload returns a new definition of the same task", () => {
    const definition = defineTask("task1")
    const typedDefinition = definition.withPayload<{ foo: string }>()

    expect(typedDefinition).not.toBe(definition)
    expect(typedDefinition.taskIdentifier).toBe("task1")
  })

  test("implement creates a named task that runs the task function", async () => {
    const calls: unknown[][] = []
    const task = defineTask("task1").withPayload<{ foo: string }>().implement(async (payload, helpers) => {
      calls.push([payload, helpers.job.task_identifier])
    })

    expect(task.taskIdentifier).toBe("task1")
    await task.run({ foo: "bar" })
    await task({ foo: "baz" }, { job: { task_identifier: "task1" } } as JobHelpers)
    expect(calls).toEqual([[{ foo: "bar" }, "task1"], [{ foo: "baz" }, "task1"]])
  })

  test("implement keeps the metadata of tasks sharing one task function apart", () => {
    const identifiers: string[] = []
    const taskFunction = (_payload: unknown, helpers: JobHelpers) => {
      identifiers.push(helpers.job.task_identifier)
    }
    const task1 = defineTask("task1").implement(taskFunction)
    const task2 = defineTask("task2").implement(taskFunction)

    task1.run(undefined)
    task2.run(undefined)

    expect([task1.taskIdentifier, task2.taskIdentifier]).toEqual(["task1", "task2"])
    expect(identifiers).toEqual(["task1", "task2"])
    expect("taskIdentifier" in taskFunction).toBe(false)
  })

  test("implemented task run propagates task function errors", async () => {
    const task = defineTask("task1").implement(async () => {
      throw new Error("task function failed")
    })

    await expect(task.run(undefined)).rejects.toThrow("task function failed")
  })

  test("implemented tasks with the same identifier are rejected by mergeTasks", () => {
    const definition = defineTask("task1")

    expect(() => mergeTasks([definition.implement(() => {}), definition.implement(() => {})])).toThrow("Task identifiers must be unique.")
  })
})
