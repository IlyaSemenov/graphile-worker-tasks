import { expectTypeOf, test } from "bun:test"

import { createDefineTask } from "./boundTasks"
import { defineTask } from "./tasks"
import type { TestJobCall } from "./testing"
import { createTestJobs } from "./testing"
import { wrapTaskDefinition } from "./wrappedTasks"

test("queries", async () => {
  const testJobs = createTestJobs()
  const defineBoundTask = createDefineTask({ addJob: testJobs.addJob })
  const sendEmailTask = defineBoundTask("sendEmail").withPayload<{ to: string }>()
  const cleanupTask = defineTask("cleanup").withPayload<void>()
  const wrappedTask = wrapTaskDefinition(defineTask("wrapped").withPayload<{ payload: number }>(), {
    encodePayload: (payload: number) => ({ payload }),
    wrapTask: task => ({ payload }, helpers) => task(payload, helpers),
  })
  const pollFeed = defineTask("pollFeed").withPayload<{ url: string }>().implement(() => {})

  const jobs = await testJobs.capture(() => "result")

  expectTypeOf(jobs.result).toEqualTypeOf<string>()
  expectTypeOf(jobs.callsFor(sendEmailTask)).toEqualTypeOf<TestJobCall<{ to: string }>[]>()
  expectTypeOf(jobs.payloadsFor(sendEmailTask)).toEqualTypeOf<{ to: string }[]>()
  expectTypeOf(jobs.payloadsFor(cleanupTask)).toEqualTypeOf<void[]>()
  expectTypeOf(jobs.payloadsFor(wrappedTask)).toEqualTypeOf<{ payload: number }[]>()
  expectTypeOf(jobs.payloadsFor(pollFeed)).toEqualTypeOf<{ url: string }[]>()
})
