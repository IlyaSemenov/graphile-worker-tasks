import { describe, expectTypeOf, test } from "bun:test"
import type { AddJobFunction, CronItem, Job, ParsedCronItem, RunnerOptions, TaskList } from "graphile-worker"

import { createDefineTask } from "./boundTasks"
import type { AnyTaskCronItem, TaskCronItem } from "./cronItems"
import { createRunnerOptions, defineCronItem } from "./cronItems"
import type { AnyNamedTask, NamedTask } from "./tasks"
import { defineTask } from "./tasks"
import { wrapTaskDefinition } from "./wrappedTasks"

describe("defineCronItem", () => {
  test("keeps the task and the payload types", () => {
    const task = defineTask("task1").withPayload<{ foo: string }>().implement(() => {})
    const cronItem = defineCronItem({ task, match: "0 4 * * *", payload: { foo: "bar" } })

    expectTypeOf(cronItem).toEqualTypeOf<TaskCronItem<typeof task>>()
    cronItem.task.run({ foo: "bar" })
    defineCronItem({ ...cronItem, identifier: "task1:later" })

    // @ts-expect-error The payload does not match the task.
    cronItem.payload = { foo: 1 }
    // @ts-expect-error A definition is not implemented.
    defineCronItem({ task: defineTask("task2"), match: "0 4 * * *" })
  })

  test("checks the payload against the task", () => {
    const unknownTask = defineTask("unknown", () => {})
    defineCronItem({ task: unknownTask, match: "0 4 * * *" })
    defineCronItem({ task: unknownTask, match: "0 4 * * *", payload: { foo: "bar" } })

    const anyTask = defineTask("any").withPayload<any>().implement(() => {})
    defineCronItem({ task: anyTask, match: "0 4 * * *" })
    defineCronItem({ task: anyTask, match: "0 4 * * *", payload: { foo: "bar" } })

    const requiredTask = defineTask("required").withPayload<{ foo: string }>().implement(() => {})
    defineCronItem({ task: requiredTask, match: "0 4 * * *", payload: { foo: "bar" } })
    // @ts-expect-error The task requires a payload.
    defineCronItem({ task: requiredTask, match: "0 4 * * *" })
    // @ts-expect-error The payload does not match the task.
    defineCronItem({ task: requiredTask, match: "0 4 * * *", payload: { foo: 1 } })
    // @ts-expect-error The task does not take this field.
    defineCronItem({ task: requiredTask, match: "0 4 * * *", payload: { foo: "bar", baz: 1 } })

    interface InterfacePayload { foo: string }
    const interfaceTask = defineTask("interface").withPayload<InterfacePayload>().implement(() => {})
    const interfacePayload: InterfacePayload = { foo: "bar" }
    defineCronItem({ task: interfaceTask, match: "0 4 * * *", payload: interfacePayload })

    const optionalTask = defineTask("optional").withPayload<{ foo?: string }>().implement(() => {})
    defineCronItem({ task: optionalTask, match: "0 4 * * *" })
    defineCronItem({ task: optionalTask, match: "0 4 * * *", payload: { foo: "bar" } })

    const cronTask = defineTask("cron").withPayload<{ foo: string, _cron: { ts: string } }>().implement(() => {})
    defineCronItem({ task: cronTask, match: "0 4 * * *", payload: { foo: "bar" } })

    const cronOnlyTask = defineTask("cronOnly").withPayload<{ _cron: { ts: string } }>().implement(() => {})
    defineCronItem({ task: cronOnlyTask, match: "0 4 * * *" })
    // @ts-expect-error A cron item payload is an object.
    defineCronItem({ task: cronOnlyTask, match: "0 4 * * *", payload: 1 })

    const voidTask = defineTask("void").withPayload<void>().implement(() => {})
    defineCronItem({ task: voidTask, match: "0 4 * * *" })
    // @ts-expect-error The task ignores the payload.
    defineCronItem({ task: voidTask, match: "0 4 * * *", payload: { foo: "bar" } })

    // The task receives an object with `_cron` rather than void, so the object part of its payload applies.
    const requiredOrVoidTask = defineTask("requiredOrVoid").withPayload<{ foo: string } | void>().implement(() => {})
    defineCronItem({ task: requiredOrVoidTask, match: "0 4 * * *", payload: { foo: "bar" } })
    // @ts-expect-error The task requires a payload.
    defineCronItem({ task: requiredOrVoidTask, match: "0 4 * * *" })

    const optionalOrVoidTask = defineTask("optionalOrVoid").withPayload<{ foo?: string } | void>().implement(() => {})
    defineCronItem({ task: optionalOrVoidTask, match: "0 4 * * *" })
    defineCronItem({ task: optionalOrVoidTask, match: "0 4 * * *", payload: { foo: "bar" } })
  })

  test("infers the payload of a task defined inline", () => {
    const cronItem = defineCronItem({ task: defineTask("inline1", () => {}), match: "0 4 * * *", payload: { foo: "bar" } })
    expectTypeOf(cronItem.task).toEqualTypeOf<NamedTask<"inline1", unknown>>()

    defineCronItem({ task: defineTask("inline2", (_payload: { foo: string }) => {}), match: "0 4 * * *", payload: { foo: "bar" } })
    // @ts-expect-error The task requires a payload.
    defineCronItem({ task: defineTask("inline3", (_payload: { foo: string }) => {}), match: "0 4 * * *" })
  })

  test("rejects tasks that cannot take a cron payload", () => {
    const undefinedTask = defineTask("undefined").withPayload<undefined>().implement(() => {})
    // @ts-expect-error A cron job payload is an object.
    defineCronItem({ task: undefinedTask, match: "0 4 * * *" })

    const stringTask = defineTask("string").withPayload<string>().implement(() => {})
    // @ts-expect-error A cron job payload is an object.
    defineCronItem({ task: stringTask, match: "0 4 * * *" })

    const arrayTask = defineTask("array").withPayload<string[]>().implement(() => {})
    // @ts-expect-error A cron job payload is a plain object.
    defineCronItem({ task: arrayTask, match: "0 4 * * *", payload: ["foo"] })

    const functionTask = defineTask("function").withPayload<() => void>().implement(() => {})
    // @ts-expect-error A cron job payload is a plain object.
    defineCronItem({ task: functionTask, match: "0 4 * * *" })

    const stringOrVoidTask = defineTask("stringOrVoid").withPayload<string | void>().implement(() => {})
    // @ts-expect-error A cron job payload is an object.
    defineCronItem({ task: stringOrVoidTask, match: "0 4 * * *" })

    const neverTask = defineTask("never").withPayload<never>().implement(() => {})
    // @ts-expect-error No payload value satisfies never.
    defineCronItem({ task: neverTask, match: "0 4 * * *" })

    const anyNamedTask: AnyNamedTask = defineTask("anyNamed").withPayload<{ foo: string }>().implement(() => {})
    // @ts-expect-error The payload type of the task is erased, so the payload cannot be checked.
    defineCronItem({ task: anyNamedTask, match: "0 4 * * *" })
  })

  test("checks the payload against each task of a union", () => {
    const fooTask = defineTask("foo").withPayload<{ foo: string }>().implement(() => {})
    const barTask = defineTask("bar").withPayload<{ bar: number }>().implement(() => {})
    const task = Math.random() < 0.5 ? fooTask : barTask

    // @ts-expect-error The payload does not match barTask.
    defineCronItem({ task, match: "0 4 * * *", payload: { foo: "bar" } })
  })

  test("checks the payload against the job payload of a wrapped task", () => {
    const definition = wrapTaskDefinition(defineTask("tenant").withPayload<{ schema: string, payload: number }>(), {
      encodePayload: (payload: number) => ({ schema: "public", payload }),
      wrapTask: task => ({ payload }, helpers) => task(payload, helpers),
    })
    const task = definition.implement(() => {})

    defineCronItem({ task, match: "0 4 * * *", payload: { schema: "public", payload: 1 } })
    // @ts-expect-error The cron item payload is the job payload, not the inner payload.
    defineCronItem({ task, match: "0 4 * * *", payload: 1 })
  })

  test("schedules a task created by a helper", () => {
    const addJob = (async () => ({}) as Job) as AddJobFunction
    const defineJobTask = createDefineTask({ addJob })

    function defineTenantTask<TIdentifier extends string>(taskIdentifier: TIdentifier) {
      const createDefinition = <TPayload>() => wrapTaskDefinition(
        defineJobTask(`tenant:${taskIdentifier}`).withPayload<{ schema: string, payload: TPayload }>(),
        {
          encodePayload: (payload: TPayload) => ({ schema: "public", payload }),
          wrapTask: task => ({ payload }, helpers) => task(payload, helpers),
        },
      )
      return Object.assign(createDefinition<unknown>(), { withPayload: createDefinition })
    }

    function defineTenantCronItem(definition: ReturnType<typeof defineTenantTask>, cronItem: Omit<CronItem, "task">) {
      const task = defineTask(`cron:${definition.taskIdentifier}`, async () => {
        await definition.addJob(undefined)
      })
      return defineCronItem({ ...cronItem, task })
    }

    createRunnerOptions({ cronItems: [defineTenantCronItem(defineTenantTask("cleanup"), { match: "0 4 * * *", options: { maxAttempts: 1 } })] })
    // @ts-expect-error The dispatcher cannot enqueue a tenant task with a payload.
    defineTenantCronItem(defineTenantTask("sendEmail").withPayload<{ to: string }>(), { match: "0 4 * * *" })
  })
})

describe("createRunnerOptions", () => {
  test("accepts cron items of different tasks", () => {
    const task1 = defineTask("task1", (_foo: number) => {})
    const task2 = defineTask("task2").withPayload<{ foo: string }>().implement(() => {})
    const voidTask = defineTask("task3").withPayload<void>().implement(() => {})
    const cronItems = [
      defineCronItem({ task: defineTask("task4", () => {}), match: "0 4 * * *" }),
      defineCronItem({ task: task2, match: "0 4 * * *", payload: { foo: "bar" } }),
      defineCronItem({ task: voidTask, match: "0 4 * * *" }),
    ]
    const anyCronItems: AnyTaskCronItem[] = cronItems
    void anyCronItems

    const runnerOptions = createRunnerOptions({ tasks: [task1, task2], cronItems })
    expectTypeOf(runnerOptions).toEqualTypeOf<{ taskList: TaskList, parsedCronItems: ParsedCronItem[] }>()
    const options: RunnerOptions = { connectionString: "postgres:///", ...runnerOptions }
    void options
  })

  test("rejects a cron item without its task", () => {
    const cronItem: CronItem = { task: "task1", match: "0 4 * * *" }
    // @ts-expect-error A cron item must hold its task.
    createRunnerOptions({ cronItems: [cronItem] })
  })
})
