import { Label } from '@/components/ui/label'
import { useFieldContext } from '@/lib/form-context'

export function SelectField({
  label,
  options,
}: {
  label: string
  options: Array<{ value: string; label: string }>
}) {
  const field = useFieldContext<string>()

  return (
    <div className="space-y-1">
      <Label htmlFor={field.name}>{label}</Label>
      <select
        id={field.name}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
