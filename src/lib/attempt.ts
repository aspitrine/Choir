import { toast } from 'sonner'

/**
 * Runs a user-triggered server call. On failure (refused by the server, network…)
 * shows an error toast instead of an unhandled rejection that leaves the UI
 * silently unchanged or stuck in a pending state. Resolves to whether it succeeded.
 */
export async function attempt(action: () => Promise<unknown>, errorMessage: string): Promise<boolean> {
  try {
    await action()
    return true
  } catch {
    toast.error(errorMessage)
    return false
  }
}
