import type { Job } from "graphile-worker"
import { expectTypeOf, test } from "vitest"

import type { BoundNamedTask } from "./boundTasks"
import { createDefineTask } from "./boundTasks"
import type { GraphileWorkerTasks } from "./tasks"
import { defineTask } from "./tasks"

function makeJob(): Job {
  return { id: "job1" } as Job
}

test("createDefineTask preserves payload typing", () => {
  const defineBoundNamedTask = createDefineTask({
    addJob: async () => makeJob(),
  })

  // eslint-disable-next-line unused-imports/no-unused-vars
  const task1 = defineTask("task1", (_foo: number) => {})
  const task4 = defineBoundNamedTask("task4", (_foo: { baz: number }) => {})

  expectTypeOf<Parameters<typeof task4.addJob>[0]>().toEqualTypeOf<{ baz: number }>()
  expectTypeOf(task4).toEqualTypeOf<BoundNamedTask<"task4", { baz: number }>>()

  interface Tasks extends GraphileWorkerTasks<[typeof task1, typeof task4]> {}

  expectTypeOf<Tasks>().toMatchObjectType<{
    task1: number
    task4: { baz: number }
  }>()
})
