# graphile-worker-tasks

## 2.3.0

### Minor Changes

- cde869d: Add standalone task definitions: `defineTask(name).withPayload<T>()` declares a task without an implementation, `implement()` creates the task, and `withAddJob()` or `createDefineTask()` binds it to `addJob` for enqueueing.

### Patch Changes

- 72f94fa: Publish only compiled files, without sources and sourcemaps.
- 47a04be: Provide `abortSignal`, `abortPromise`, and `addJobs` in the default `task.run` helpers.
- f6eb0e5: Make `helpers.abortPromise` reject when an `abortSignal` passed to `task.run` aborts.
- 8a772de: Make `createTaskList` reject tasks with duplicate identifiers instead of keeping only the last one.
- b2b17ca: Fix the `TaskResult` type with graphile-worker 0.12 and 0.13.

## 2.2.1

### Patch Changes

- c6abf78: Fix `mergeTasks` and `createTaskList` to accept tasks with different payload types without requiring `any`.
  Export the new `AnyNamedTask` type (`NamedTask<string, never>`) for consumers who need to type a heterogeneous list of tasks themselves.

## 2.2.0

### Minor Changes

- c4ad3ca: Add `task.run(payload, helpers?)` to run any defined task directly, useful in tests.

## 2.1.0

### Minor Changes

- 20f8b6b: Add support for binding `addJob` to defined tasks.

### Patch Changes

- 3b46450: Changed wording of "task name" to "task identifier" to match upstream.

## 2.0.1

### Patch Changes

- 32f2994: Export `Task` type for reuse.

## 2.0.0

### Major Changes

- 9d5f6b3: Reverse the API — instead of inferring from `GraphileWorker.Tasks`, populate it from the defined tasks.

## 1.0.0

### Major Changes

- 31b4645: Initial release.
