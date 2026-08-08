import { createFormHook } from '@tanstack/react-form'
import { TextField } from '@/components/form/text-field'
import { SelectField } from '@/components/form/select-field'
import { SubmitButton } from '@/components/form/submit-button'
import { fieldContext, formContext } from './form-context'

export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, SelectField },
  formComponents: { SubmitButton },
})
