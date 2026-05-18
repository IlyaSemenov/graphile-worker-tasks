import type { JobHelpers } from "graphile-worker"
import { expectTypeOf, test } from "vitest"

import type { GraphileWorkerTasks } from "./tasks"
import { defineTask } from "./tasks"

test("defineTask, GraphileWorkerTasks", () => {
  const task1 = defineTask("task1", (_foo: number) => {})
  const task2 = defineTask("task2", (_foo: { bar: string }, helpers) => {
    expectTypeOf(helpers).toEqualTypeOf<JobHelpers>()
  })
  const task3 = defineTask("task3", () => {})

  expectTypeOf<Parameters<typeof task1.run>[0]>().toEqualTypeOf<number>()
  expectTypeOf<Parameters<typeof task2.run>[0]>().toEqualTypeOf<{ bar: string }>()

  task2.run({ bar: "baz" }, ({ payload }) => {
    expectTypeOf(payload).toEqualTypeOf<{ bar: string }>()
    throw new Error("test helper factory")
  })

  const _tasks = [task1, task2, task3]

  interface Tasks extends GraphileWorkerTasks<typeof _tasks> {}

  expectTypeOf<Tasks>().toMatchObjectType<{
    task1: number
    task2: { bar: string }
    // TODO: This should be "never", not "unknown".
    task3: unknown
  }>()
})
