import { expectTypeOf, test } from "bun:test"
import type { Job, TaskSpec } from "graphile-worker"

import type { BoundNamedTask, BoundTaskDefinition } from "./boundTasks"
import { createDefineTask } from "./boundTasks"
import type { GraphileWorkerTasks, Task } from "./tasks"
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
  expectTypeOf<Parameters<typeof task4.run>[0]>().toEqualTypeOf<{ baz: number }>()
  expectTypeOf(task4).toEqualTypeOf<BoundNamedTask<"task4", { baz: number }>>()

  interface Tasks extends GraphileWorkerTasks<[typeof task1, typeof task4]> {}

  expectTypeOf<Tasks>().toMatchObjectType<{
    task1: number
    task4: { baz: number }
  }>()
})

test("createDefineTask keeps its legacy signature for explicit generics and type extraction", () => {
  const defineBoundNamedTask = createDefineTask({
    addJob: async () => makeJob(),
  })

  const task = defineBoundNamedTask<"task1", number>("task1", (_foo) => {})

  expectTypeOf(task).toEqualTypeOf<BoundNamedTask<"task1", number>>()
  expectTypeOf<Parameters<typeof defineBoundNamedTask>>().toEqualTypeOf<[taskIdentifier: string, task: Task<unknown>]>()
  expectTypeOf<ReturnType<typeof defineBoundNamedTask>>().toEqualTypeOf<BoundNamedTask<string, unknown>>()
})

test("bound task definition", () => {
  const addJob = async () => makeJob()
  const defineBoundNamedTask = createDefineTask({ addJob })

  const definition = defineTask("task1").withPayload<{ foo: string }>()
  const boundDefinition = definition.withAddJob(addJob)
  expectTypeOf(boundDefinition).toEqualTypeOf<BoundTaskDefinition<"task1", { foo: string }>>()
  expectTypeOf(defineTask("task1").withAddJob(addJob).withPayload<{ foo: string }>()).toEqualTypeOf<BoundTaskDefinition<"task1", { foo: string }>>()
  expectTypeOf(defineBoundNamedTask("task1").withPayload<{ foo: string }>()).toEqualTypeOf<BoundTaskDefinition<"task1", { foo: string }>>()
  expectTypeOf<Parameters<typeof boundDefinition.addJob>>().toEqualTypeOf<[payload: { foo: string }, spec?: TaskSpec]>()

  // @ts-expect-error The payload type does not match.
  boundDefinition.addJob({ foo: 1 })

  const task = boundDefinition.implement((payload) => {
    expectTypeOf(payload).toEqualTypeOf<{ foo: string }>()
  })
  expectTypeOf(task).toEqualTypeOf<BoundNamedTask<"task1", { foo: string }>>()

  // @ts-expect-error A bound definition cannot be bound again.
  boundDefinition.withAddJob(addJob)
  // @ts-expect-error A bound definition cannot be bound again.
  defineBoundNamedTask("task2").withAddJob(addJob)
})
