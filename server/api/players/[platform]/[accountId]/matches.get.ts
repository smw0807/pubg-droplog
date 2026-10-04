import { getQuery, getRouterParam } from 'h3'
import { z } from 'zod'
import { matchFiltersSchema, platformSchema, resourceIdSchema } from '../../../../../shared/schemas/report'
import { reviewService } from '../../../../services/runtime'
import { apiHandler } from '../../../../utils/http'

const querySchema = matchFiltersSchema.extend({ cursor: z.string().max(2048).optional(), refresh: z.enum(['true', 'false']).optional().transform(value => value === 'true') })
export default apiHandler(event => reviewService().matches(platformSchema.parse(getRouterParam(event, 'platform')), resourceIdSchema.parse(getRouterParam(event, 'accountId')), querySchema.parse(getQuery(event))))
