# graphile-worker-tasks

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
