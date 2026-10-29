import { expect, test } from "bun:test"

import type { AnyTaskCronItem } from "./cronItems"
import { createRunnerOptions, defineCronItem } from "./cronItems"
import { defineTask } from "./tasks"

test("createRunnerOptions adds the tasks of cron items to the task list", () => {
  const enqueuedTask = defineTask("enqueued", () => {})
  const scheduledTask = defineTask("scheduled", () => {})

  const { taskList } = createRunnerOptions({
    tasks: [enqueuedTask],
    cronItems: [defineCronItem({ task: scheduledTask, match: "0 4 * * *" })],
  })

  expect(taskList).toEqual({ enqueued: enqueuedTask, scheduled: scheduledTask })
})

test("createRunnerOptions lists a task that is both enqueued and scheduled once", () => {
  const task = defineTask("task1", () => {})

  const { taskList } = createRunnerOptions({
    tasks: [task],
    cronItems: [
      defineCronItem({ task, match: "0 4 * * *" }),
      defineCronItem({ task, match: "0 5 * * *", identifier: "task1:later" }),
    ],
  })

  expect(taskList).toEqual({ task1: task })
})

test("createRunnerOptions parses cron items with the task identifier", () => {
  const task = defineTask("task1", () => {})
  const match = () => true

  const { parsedCronItems } = createRunnerOptions({
    cronItems: [
      defineCronItem({ task, match, options: { maxAttempts: 1 } }),
      // Like graphile-worker, only a missing identifier defaults to the task identifier.
      defineCronItem({ task, match: "0 5 * * *", identifier: "", payload: { foo: "bar" } }),
    ],
  })

  expect(parsedCronItems).toMatchObject([
    { task: "task1", identifier: "task1", match, payload: {}, options: { maxAttempts: 1, backfillPeriod: 0 } },
    { task: "task1", identifier: "", payload: { foo: "bar" }, options: { backfillPeriod: 0 } },
  ])
})

test("createRunnerOptions without cron items schedules nothing", () => {
  const task = defineTask("task1", () => {})

  expect(createRunnerOptions({ tasks: [task] })).toEqual({ taskList: { task1: task }, parsedCronItems: [] })
})

test("createRunnerOptions rejects different tasks with the same identifier", () => {
  const enqueuedTask = defineTask("task1", () => {})
  const scheduledTask = defineTask("task1", () => {})

  expect(() => createRunnerOptions({
    tasks: [enqueuedTask],
    cronItems: [defineCronItem({ task: scheduledTask, match: "0 4 * * *" })],
  })).toThrow("Task identifiers must be unique.")
})

test("createRunnerOptions rejects an unimplemented task of a cron item", () => {
  const cronItem = { task: defineTask("task1"), match: "0 4 * * *" } as unknown as AnyTaskCronItem

  expect(() => createRunnerOptions({ cronItems: [cronItem] })).toThrow(`Task "task1" is not implemented.`)
})

test("createRunnerOptions rejects duplicate cron item identifiers", () => {
  const task1 = defineTask("task1", () => {})
  const task2 = defineTask("task2", () => {})

  expect(() => createRunnerOptions({
    cronItems: [
      defineCronItem({ task: task1, match: "0 4 * * *" }),
      defineCronItem({ task: task1, match: "0 5 * * *" }),
    ],
  })).toThrow(`Cron item identifiers must be unique: "task1" is used more than once.`)
  expect(() => createRunnerOptions({
    cronItems: [
      defineCronItem({ task: task1, match: "0 4 * * *" }),
      defineCronItem({ task: task2, match: "0 5 * * *", identifier: "task1" }),
    ],
  })).toThrow(`Cron item identifiers must be unique: "task1" is used more than once.`)
})
