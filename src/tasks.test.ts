import { describe, expect, test } from "vitest"

import { createTaskList, defineTask, mergeTasks } from "./tasks"

describe("mergeTasks", () => {
  const task1 = defineTask("task1", () => {})
  const task2 = defineTask("task2", () => {})
  const task3 = defineTask("task2", () => {}) // Duplicate task name

  test("merge tasks", () => {
    expect(mergeTasks([task1, task2])).toEqual([task1, task2])
  })

  test("merge tasks with duplicate names", () => {
    expect(() => mergeTasks([task1, task2, task3])).toThrow("Task names must be unique.")
  })
})

test("createTaskList", () => {
  const task1 = defineTask("task1", () => {})
  const task2 = defineTask("task2", () => {})

  expect(createTaskList([task1, task2])).toEqual({ task1, task2 })
})
