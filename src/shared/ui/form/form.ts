import { createFormHook } from '@tanstack/react-form'
import { TextField } from '@/shared/ui/form/text-field'
import { SelectField } from '@/shared/ui/form/select-field'
import { SubmitButton } from '@/shared/ui/form/submit-button'
import { fieldContext, formContext } from '@/shared/ui/form/form-context'

export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, SelectField },
  formComponents: { SubmitButton },
})
