import { expectTypeOf, test } from "bun:test"
import type { JobHelpers } from "graphile-worker"

import type { AnyNamedTask, GraphileWorkerTasks, NamedTask, Task, TaskDefinition } from "./tasks"
import { createTaskList, defineTask, mergeTasks } from "./tasks"

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

test("AnyNamedTask accepts a heterogeneous list of tasks by payload type", () => {
  const task1 = defineTask("task1", (_foo: number) => {})
  const task2 = defineTask("task2", (_foo: { bar: string }) => {})

  const tasks: AnyNamedTask[] = [task1, task2]
  void tasks

  const merged = mergeTasks([task1, task2])
  expectTypeOf(merged).toEqualTypeOf<(typeof task1 | typeof task2)[]>()
})

test("defineTask keeps its legacy signature for explicit generics and type extraction", () => {
  const task = defineTask<"task1", number>("task1", (_foo) => {})

  expectTypeOf(task).toEqualTypeOf<NamedTask<"task1", number>>()
  expectTypeOf<Parameters<typeof defineTask>>().toEqualTypeOf<[taskIdentifier: string, task: Task<unknown>]>()
  expectTypeOf<ReturnType<typeof defineTask>>().toEqualTypeOf<NamedTask<string, unknown>>()
})

test("task definition", () => {
  const definition = defineTask("task1")
  expectTypeOf(definition).toEqualTypeOf<TaskDefinition<"task1", unknown>>()

  const objectDefinition = definition.withPayload<{ foo: string }>()
  expectTypeOf(objectDefinition).toEqualTypeOf<TaskDefinition<"task1", { foo: string }>>()
  expectTypeOf(defineTask("task2").withPayload<string>()).toEqualTypeOf<TaskDefinition<"task2", string>>()
  expectTypeOf(defineTask("task3").withPayload<number[]>()).toEqualTypeOf<TaskDefinition<"task3", number[]>>()

  const task1 = objectDefinition.implement((payload, helpers) => {
    expectTypeOf(payload).toEqualTypeOf<{ foo: string }>()
    expectTypeOf(helpers).toEqualTypeOf<JobHelpers>()
  })
  expectTypeOf(task1).toEqualTypeOf<NamedTask<"task1", { foo: string }>>()

  task1.run({ foo: "bar" })
  // @ts-expect-error The payload type does not match.
  task1.run({ foo: 1 })

  // @ts-expect-error The task function expects a different payload type.
  objectDefinition.implement((_foo: number) => {})

  const task2 = defineTask("task2").withPayload<string>().implement(() => {})
  const tasks = mergeTasks([task1, task2])
  expectTypeOf(tasks).toEqualTypeOf<(typeof task1 | typeof task2)[]>()
  const anyTasks: AnyNamedTask[] = tasks
  void anyTasks

  interface Tasks extends GraphileWorkerTasks<typeof tasks> {}

  expectTypeOf<Tasks>().toMatchObjectType<{
    task1: { foo: string }
    task2: string
  }>()

  // @ts-expect-error A definition is not implemented.
  createTaskList([objectDefinition])
  // @ts-expect-error A definition is not implemented.
  mergeTasks([task1, objectDefinition])
})
