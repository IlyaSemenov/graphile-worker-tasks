import { describe, expect, test } from "bun:test"
import type { AddJobFunction, Job, JobHelpers } from "graphile-worker"

import { createDefineTask } from "./boundTasks"
import { createTaskList, defineTask } from "./tasks"
import type { TaskDefinitionWrapper } from "./wrappedTasks"
import { prefixTaskSpec, wrapTaskDefinition } from "./wrappedTasks"

type TenantJobPayload<TPayload> = { schema: string, payload: TPayload }

let currentSchema: string | undefined

function getTenantSchema(): string {
  if (currentSchema === undefined) {
    throw new Error("No tenant.")
  }
  return currentSchema
}

async function withTenantSchema<T>(schema: string, callback: () => T): Promise<Awaited<T>> {
  const previousSchema = currentSchema
  currentSchema = schema
  try {
    return await callback()
  } finally {
    currentSchema = previousSchema
  }
}

function createTenantWrapper<TPayload>(): TaskDefinitionWrapper<TPayload, TenantJobPayload<TPayload>> {
  return {
    encodePayload: payload => ({ schema: getTenantSchema(), payload }),
    encodeSpec: (spec, { schema }) => prefixTaskSpec(spec, `tenant:${schema}:`),
    wrapTask: task => ({ schema, payload }, helpers) => withTenantSchema(schema, () => task(payload, helpers)),
  }
}

function makeJob(): Job {
  return { id: "job1" } as Job
}

function createAddJob(calls: unknown[][]): AddJobFunction {
  return async (identifier, payload, spec) => {
    calls.push([identifier, payload, spec])
    return makeJob()
  }
}

describe("bound wrapped definition", () => {
  const calls: unknown[][] = []
  const query = (async () => []) as unknown as JobHelpers["query"]
  const defineJobTask = createDefineTask({ addJob: createAddJob(calls), helpers: { query } })

  function defineTenantTask<TIdentifier extends string>(taskIdentifier: TIdentifier) {
    return {
      withPayload: <TPayload>() => wrapTaskDefinition(
        defineJobTask(`tenant:${taskIdentifier}`).withPayload<TenantJobPayload<TPayload>>(),
        createTenantWrapper<TPayload>(),
      ),
    }
  }

  const sendEmailTask = defineTenantTask("sendEmail").withPayload<{ to: string }>()

  test("enqueues the job payload and spec built in the current context", async () => {
    calls.length = 0

    await withTenantSchema("acme", async () => {
      await sendEmailTask.addJob({ to: "user@example.com" }, { jobKey: "welcome", queueName: "emails", priority: 1 })
      await sendEmailTask.addJob({ to: "admin@example.com" })
    })

    expect(sendEmailTask.taskIdentifier).toBe("tenant:sendEmail")
    expect(calls).toEqual([
      ["tenant:sendEmail", { schema: "acme", payload: { to: "user@example.com" } }, { jobKey: "tenant:acme:welcome", queueName: "tenant:acme:emails", priority: 1 }],
      ["tenant:sendEmail", { schema: "acme", payload: { to: "admin@example.com" } }, undefined],
    ])
  })

  test("runs the task function with the inner payload in the context of the job payload", async () => {
    const runs: unknown[][] = []
    const sendEmail = sendEmailTask.implement((payload) => {
      runs.push([payload, getTenantSchema()])
    })

    await sendEmail({ schema: "acme", payload: { to: "user@example.com" } }, {} as JobHelpers)

    expect(runs).toEqual([[{ to: "user@example.com" }, "acme"]])
    expect<unknown>(createTaskList([sendEmail])).toEqual({ "tenant:sendEmail": sendEmail })
  })

  test("runs the task manually with the job payload built in the current context", async () => {
    const runs: unknown[][] = []
    const factoryCalls: unknown[][] = []
    const perCallQuery = (async () => []) as unknown as JobHelpers["query"]
    const sendEmail = sendEmailTask.implement((payload, helpers) => {
      runs.push([payload, getTenantSchema(), helpers.query])
    })

    await withTenantSchema("acme", () => sendEmail.run({ to: "user@example.com" }))
    await withTenantSchema("acme", () => sendEmail.run({ to: "admin@example.com" }, ({ defaultHelpers, payload }) => {
      factoryCalls.push([payload, defaultHelpers.query])
      return { ...defaultHelpers, query: perCallQuery }
    }))

    expect(factoryCalls).toEqual([[{ schema: "acme", payload: { to: "admin@example.com" } }, query]])
    expect(runs).toEqual([
      [{ to: "user@example.com" }, "acme", query],
      [{ to: "admin@example.com" }, "acme", perCallQuery],
    ])
  })

  test("implements several definitions with one task function without changing it", () => {
    const taskFunction = () => {}
    const sendEmail = sendEmailTask.implement(taskFunction)
    const notify = defineTenantTask("notify").withPayload<{ to: string }>().implement(taskFunction)

    expect([sendEmail.taskIdentifier, notify.taskIdentifier]).toEqual(["tenant:sendEmail", "tenant:notify"])
    expect(["taskIdentifier", "run", "addJob"].filter(key => key in taskFunction)).toEqual([])
  })
})

describe("unbound wrapped definition", () => {
  const sendEmailTask = wrapTaskDefinition(
    defineTask("tenant:sendEmail").withPayload<TenantJobPayload<{ to: string }>>(),
    createTenantWrapper<{ to: string }>(),
  )

  test("binds to addJob through withAddJob", async () => {
    const calls: unknown[][] = []
    const boundSendEmailTask = sendEmailTask.withAddJob(createAddJob(calls))

    await withTenantSchema("acme", () => boundSendEmailTask.addJob({ to: "user@example.com" }, { jobKey: "welcome" }))

    expect(calls).toEqual([["tenant:sendEmail", { schema: "acme", payload: { to: "user@example.com" } }, { jobKey: "tenant:acme:welcome" }]])
    expect("addJob" in sendEmailTask).toBe(false)
  })

  test("runs the task manually with the job payload built in the current context", async () => {
    const runs: unknown[][] = []
    const sendEmail = sendEmailTask.implement((payload, helpers) => {
      runs.push([payload, getTenantSchema(), helpers.job.payload])
    })

    await withTenantSchema("acme", () => sendEmail.run({ to: "user@example.com" }))

    expect(runs).toEqual([[{ to: "user@example.com" }, "acme", { schema: "acme", payload: { to: "user@example.com" } }]])
  })
})

describe("wrapper without encodeSpec", () => {
  test("encodes the payload once per job and passes the spec unchanged", async () => {
    const calls: unknown[][] = []
    const encodedPayloads: unknown[] = []
    const wrapper: TaskDefinitionWrapper<string, { message: string }> = {
      encodePayload: (message) => {
        encodedPayloads.push(message)
        return { message }
      },
      wrapTask: task => ({ message }, helpers) => task(message, helpers),
    }
    const notifyTask = wrapTaskDefinition(defineTask("notify").withPayload<{ message: string }>().withAddJob(createAddJob(calls)), wrapper)
    const spec = { jobKey: "welcome", queueName: "notifications" }

    await notifyTask.addJob("hello", spec)
    await notifyTask.implement(() => {}).run("bye")

    expect(calls).toEqual([["notify", { message: "hello" }, spec]])
    expect(calls[0]![2]).toBe(spec)
    expect(encodedPayloads).toEqual(["hello", "bye"])
  })
})

describe("prefixTaskSpec", () => {
  test("prefixes the job key and the queue name", () => {
    expect(prefixTaskSpec({ jobKey: "welcome", queueName: "emails", priority: 1 }, "tenant:acme:")).toEqual({
      jobKey: "tenant:acme:welcome",
      queueName: "tenant:acme:emails",
      priority: 1,
    })
  })

  test("keeps a missing spec, job key and queue name missing", () => {
    expect(prefixTaskSpec(undefined, "tenant:acme:")).toBeUndefined()
    expect(prefixTaskSpec({ priority: 1 }, "tenant:acme:")).toStrictEqual({ priority: 1 })
  })

  test("keeps an empty job key and queue name empty", () => {
    expect(prefixTaskSpec({ jobKey: "", queueName: "" }, "tenant:acme:")).toStrictEqual({ jobKey: "", queueName: "" })
  })
})
