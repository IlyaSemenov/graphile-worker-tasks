import { describe, expect, test } from "bun:test"

import { createDefineTask } from "./boundTasks"
import { createTestJobs } from "./testing"
import { wrapTaskDefinition } from "./wrappedTasks"

describe("addJob", () => {
  test("records the job", async () => {
    const testJobs = createTestJobs()
    const spec = { queueName: "serial" }

    await testJobs.addJob("task1", { foo: "bar" }, spec)
    await testJobs.addJob("task2", 1)

    expect(testJobs.calls).toEqual([
      { identifier: "task1", payload: { foo: "bar" }, spec },
      { identifier: "task2", payload: 1, spec: undefined },
    ])
  })

  test("returns a job built from the call", async () => {
    const testJobs = createTestJobs()
    const runAt = new Date("2026-01-01T00:00:00.000Z")

    const job1 = await testJobs.addJob("task1", { foo: "bar" }, {
      runAt,
      priority: 1,
      maxAttempts: 5,
      jobKey: "key1",
      flags: ["flag1"],
    })
    const job2 = await testJobs.addJob("task2", undefined, { maxAttempts: 0, jobKey: "" })

    expect(job1).toMatchObject({
      task_identifier: "task1",
      payload: { foo: "bar" },
      run_at: runAt,
      priority: 1,
      max_attempts: 5,
      key: "key1",
      flags: { flag1: true },
    })
    expect(job2).toMatchObject({
      task_identifier: "task2",
      payload: {},
      priority: 0,
      max_attempts: 25,
      key: null,
      flags: null,
    })
    expect(job2.run_at).toBeInstanceOf(Date)
    expect(job2.id).not.toBe(job1.id)
  })
})

describe("clear", () => {
  test("forgets recorded jobs", async () => {
    const testJobs = createTestJobs()
    await testJobs.addJob("task1", 1)

    testJobs.clear()

    expect(testJobs.calls).toEqual([])
  })

  test("keeps jobs captured by a running capture", async () => {
    const testJobs = createTestJobs()

    const jobs = await testJobs.capture(async () => {
      await testJobs.addJob("task1", 1)
      testJobs.clear()
      await testJobs.addJob("task1", 2)
    })

    expect(jobs.calls.map(call => call.payload)).toEqual([1, 2])
    expect(testJobs.calls.map(call => call.payload)).toEqual([2])
  })
})

describe("capture", () => {
  test("returns only the jobs enqueued during the action and its result", async () => {
    const testJobs = createTestJobs()
    await testJobs.addJob("task1", "before")

    const jobs = await testJobs.capture(async () => {
      await testJobs.addJob("task1", "during")
      return "result"
    })
    await testJobs.addJob("task1", "after")

    expect(jobs.result).toBe("result")
    expect(jobs.calls.map(call => call.payload)).toEqual(["during"])
  })

  test("runs a synchronous action", async () => {
    const testJobs = createTestJobs()

    const jobs = await testJobs.capture(() => {
      void testJobs.addJob("task1", 1)
      return "result"
    })

    expect(jobs.result).toBe("result")
    expect(jobs.calls.map(call => call.payload)).toEqual([1])
  })

  test("includes the jobs of a nested capture in the outer one", async () => {
    const testJobs = createTestJobs()

    const outerJobs = await testJobs.capture(async () => {
      await testJobs.addJob("task1", "outer")
      return testJobs.capture(() => testJobs.addJob("task1", "inner"))
    })

    expect(outerJobs.calls.map(call => call.payload)).toEqual(["outer", "inner"])
    expect(outerJobs.result.calls.map(call => call.payload)).toEqual(["inner"])
  })

  test("rejects with the error of the action and keeps capturing afterwards", async () => {
    const testJobs = createTestJobs()

    await expect(testJobs.capture(async () => {
      await testJobs.addJob("task1", 1)
      throw new Error("Action failed.")
    })).rejects.toThrow("Action failed.")
    const jobs = await testJobs.capture(() => testJobs.addJob("task1", 2))

    expect(jobs.calls.map(call => call.payload)).toEqual([2])
  })
})

describe("queries", () => {
  test("filter jobs by the task identifier of a definition", async () => {
    const testJobs = createTestJobs()
    const defineTask = createDefineTask({ addJob: testJobs.addJob })
    const sendEmailTask = defineTask("sendEmail").withPayload<{ to: string }>()
    const cleanupTask = defineTask("cleanup").withPayload<void>()
    const spec = { maxAttempts: 5 }

    const jobs = await testJobs.capture(async () => {
      await sendEmailTask.addJob({ to: "user@example.com" }, spec)
      await cleanupTask.addJob()
    })

    expect(jobs.callsFor(sendEmailTask)).toEqual([
      { identifier: "sendEmail", payload: { to: "user@example.com" }, spec },
    ])
    expect(jobs.payloadsFor(sendEmailTask)).toEqual([{ to: "user@example.com" }])
    expect(jobs.payloadsFor(cleanupTask)).toEqual([undefined])
  })

  test("return the job payload of a wrapped definition", async () => {
    const testJobs = createTestJobs()
    const defineTask = createDefineTask({ addJob: testJobs.addJob })
    const sendEmailTask = wrapTaskDefinition(
      defineTask("sendEmail").withPayload<{ payload: { to: string } }>(),
      {
        encodePayload: (payload: { to: string }) => ({ payload }),
        wrapTask: task => ({ payload }, helpers) => task(payload, helpers),
      },
    )

    const jobs = await testJobs.capture(() => sendEmailTask.addJob({ to: "user@example.com" }))

    expect(jobs.payloadsFor(sendEmailTask)).toEqual([{ payload: { to: "user@example.com" } }])
  })
})
