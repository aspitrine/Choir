import { Button } from '@/components/ui/button'
import { useFormContext } from '@/lib/form-context'

export function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel?: string }) {
  const form = useFormContext()

  return (
    <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
      {([canSubmit, isSubmitting]) => (
        <Button type="submit" className="w-full" disabled={!canSubmit || isSubmitting}>
          {isSubmitting ? (pendingLabel ?? `${label}…`) : label}
        </Button>
      )}
    </form.Subscribe>
  )
}
