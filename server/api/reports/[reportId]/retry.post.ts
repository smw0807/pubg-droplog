import { getRouterParam } from 'h3'
import { z } from 'zod'
import { reviewService } from '../../../services/runtime'
import { apiHandler, clientIdentity } from '../../../utils/http'

export default apiHandler(event => reviewService().retry(z.string().uuid().parse(getRouterParam(event, 'reportId')), clientIdentity(event)))
