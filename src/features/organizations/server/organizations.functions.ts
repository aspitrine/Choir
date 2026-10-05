import { createServerFn } from '@tanstack/react-start'
import { withActor } from '@/app/runtime'
import { deleteOrganization } from '../application/organizations'

export const deleteOrganizationFn = createServerFn({ method: 'POST' }).handler(() => withActor(deleteOrganization))
