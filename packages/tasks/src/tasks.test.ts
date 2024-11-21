import { expect, suite, test } from "vitest"

import { createTaskList, defineTask } from "./tasks"

suite("createTaskList", () => {
  // @ts-expect-error GraphileWorker.Tasks is never in test scope.
  const handleTask1 = defineTask("task1", () => {})
  // @ts-expect-error GraphileWorker.Tasks is never in test scope.
  const handleTask2 = defineTask("task2", () => {})

  test("list of tasks", () => {
    expect(createTaskList([handleTask1, handleTask2])).toEqual({ task1: handleTask1, task2: handleTask2 })
  })

  test("object of tasks", () => {
    expect(createTaskList({ handleTask1, handleTask2 })).toEqual({ task1: handleTask1, task2: handleTask2 })
  })
})
