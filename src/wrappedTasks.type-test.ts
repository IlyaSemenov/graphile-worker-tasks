import { expectTypeOf, test } from "bun:test"
import type { AddJobFunction, Job, TaskSpec } from "graphile-worker"

import { createDefineTask } from "./boundTasks"
import type { GraphileWorkerTasks, NamedTask, TaskJobPayload, TaskPayload } from "./tasks"
import { createTaskList, defineTask, mergeTasks } from "./tasks"
import type { BoundWrappedTaskDefinition, TaskDefinitionWrapper, WrappedTaskDefinition } from "./wrappedTasks"
import { prefixTaskSpec, wrapTaskDefinition } from "./wrappedTasks"

type TenantJobPayload<TPayload> = { schema: string, payload: TPayload }

declare function createTenantWrapper<TPayload>(): TaskDefinitionWrapper<TPayload, TenantJobPayload<TPayload>>
declare function getTenantSchema(): string
declare function withTenantSchema<T>(schema: string, callback: () => T): Promise<Awaited<T>>

const addJob = (async () => ({}) as Job) as AddJobFunction
const defineJobTask = createDefineTask({ addJob })

function defineTenantTask<TIdentifier extends string>(taskIdentifier: TIdentifier) {
  const createDefinition = <TPayload>() => wrapTaskDefinition(
    defineJobTask(`tenant:${taskIdentifier}`).withPayload<TenantJobPayload<TPayload>>(),
    {
      encodePayload: (payload: TPayload) => ({ schema: getTenantSchema(), payload }),
      encodeSpec: (spec, { schema }) => prefixTaskSpec(spec, `tenant:${schema}:`),
      wrapTask: task => ({ schema, payload }, helpers) => withTenantSchema(schema, () => task(payload, helpers)),
    },
  )
  return Object.assign(createDefinition<unknown>(), { withPayload: createDefinition })
}

test("bound wrapped definition without payload", () => {
  const definition = defineTenantTask("cleanup")
  expectTypeOf(definition.taskIdentifier).toEqualTypeOf<"tenant:cleanup">()
  expectTypeOf<Parameters<typeof definition.addJob>>().toEqualTypeOf<[payload: unknown, spec?: TaskSpec]>()

  const task = definition.implement(() => {})
  expectTypeOf(task).toEqualTypeOf<NamedTask<"tenant:cleanup", TenantJobPayload<unknown>, unknown>>()
})

test("bound wrapped definition", () => {
  const definition = defineTenantTask("sendEmail").withPayload<{ to: string }>()
  expectTypeOf(definition).toEqualTypeOf<BoundWrappedTaskDefinition<"tenant:sendEmail", { to: string }, TenantJobPayload<{ to: string }>>>()
  expectTypeOf<Parameters<typeof definition.addJob>>().toEqualTypeOf<[payload: { to: string }, spec?: TaskSpec]>()

  const task = definition.implement((payload) => {
    expectTypeOf(payload).toEqualTypeOf<{ to: string }>()
  })
  expectTypeOf(task).toEqualTypeOf<NamedTask<"tenant:sendEmail", TenantJobPayload<{ to: string }>, { to: string }>>()
  expectTypeOf<Parameters<typeof task>[0]>().toEqualTypeOf<TenantJobPayload<{ to: string }>>()
  expectTypeOf<Parameters<typeof task.run>[0]>().toEqualTypeOf<{ to: string }>()

  task.run({ to: "user@example.com" }, ({ payload }) => {
    expectTypeOf(payload).toEqualTypeOf<TenantJobPayload<{ to: string }>>()
    throw new Error("test helper factory")
  })

  expectTypeOf<TaskPayload<typeof definition>>().toEqualTypeOf<{ to: string }>()
  expectTypeOf<TaskPayload<typeof task>>().toEqualTypeOf<{ to: string }>()
  expectTypeOf<TaskJobPayload<typeof definition>>().toEqualTypeOf<TenantJobPayload<{ to: string }>>()
  expectTypeOf<TaskJobPayload<typeof task>>().toEqualTypeOf<TenantJobPayload<{ to: string }>>()

  const tasks = mergeTasks([task, defineTask("task1").withPayload<number>().implement(() => {})])
  createTaskList(tasks)

  interface Tasks extends GraphileWorkerTasks<[typeof definition, ...typeof tasks]> {}

  expectTypeOf<Tasks>().toEqualTypeOf<{
    "tenant:sendEmail": TenantJobPayload<{ to: string }>
    "task1": number
  }>()

  // @ts-expect-error The payload is set before wrapping.
  definition.withPayload<string>()
  // @ts-expect-error A bound definition cannot be bound again.
  definition.withAddJob(addJob)
  // @ts-expect-error Producers enqueue the inner payload.
  definition.addJob({ schema: "acme", payload: { to: "user@example.com" } })
})

test("unbound wrapped definition", () => {
  const definition = wrapTaskDefinition(
    defineTask("tenant:sendEmail").withPayload<TenantJobPayload<{ to: string }>>(),
    createTenantWrapper<{ to: string }>(),
  )
  expectTypeOf(definition).toEqualTypeOf<WrappedTaskDefinition<"tenant:sendEmail", { to: string }, TenantJobPayload<{ to: string }>>>()
  expectTypeOf(definition.withAddJob(addJob)).toEqualTypeOf<BoundWrappedTaskDefinition<"tenant:sendEmail", { to: string }, TenantJobPayload<{ to: string }>>>()
  expectTypeOf<TaskPayload<typeof definition>>().toEqualTypeOf<{ to: string }>()
  expectTypeOf<TaskJobPayload<typeof definition>>().toEqualTypeOf<TenantJobPayload<{ to: string }>>()

  // @ts-expect-error An unbound definition does not enqueue jobs.
  definition.addJob({ to: "user@example.com" })
  // @ts-expect-error The wrapper does not match the job payload of the definition.
  wrapTaskDefinition(defineTask("tenant:sendEmail").withPayload<string>(), createTenantWrapper<{ to: string }>())
})

test("prefixTaskSpec", () => {
  expectTypeOf(prefixTaskSpec({ jobKey: "welcome" }, "tenant:acme:")).toEqualTypeOf<TaskSpec>()
  expectTypeOf(prefixTaskSpec(undefined as TaskSpec | undefined, "tenant:acme:")).toEqualTypeOf<TaskSpec | undefined>()
})
