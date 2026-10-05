// Query keys, hierarchical: invalidating a prefix (e.g. the `all` key) refetches everything below it.
export const sessionKeys = {
  all: ['session'] as const,
  current: () => [...sessionKeys.all, 'current'] as const,
  role: () => [...sessionKeys.all, 'role'] as const,
}
