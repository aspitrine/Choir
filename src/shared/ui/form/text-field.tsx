import { Input } from '@/shared/ui/primitives/input'
import { Label } from '@/shared/ui/primitives/label'
import { useFieldContext } from '@/shared/ui/form/form-context'

export function TextField({
  label,
  placeholder,
  autoFocus,
}: {
  label: string
  placeholder?: string
  autoFocus?: boolean
}) {
  const field = useFieldContext<string>()
  const errors = field.state.meta.isTouched ? field.state.meta.errors : []

  return (
    <div className="space-y-1">
      <Label htmlFor={field.name}>{label}</Label>
      <Input
        id={field.name}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      {errors.length > 0 ? (
        <p className="text-sm text-destructive">
          {errors.map((e) => (typeof e === 'string' ? e : e.message)).join(', ')}
        </p>
      ) : null}
    </div>
  )
}
