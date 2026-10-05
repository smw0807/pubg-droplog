import { getRouterParam } from 'h3'
import { reportIdSchema } from '../../../shared/schemas/report'
import { reviewService } from '../../services/runtime'
import { apiHandler } from '../../utils/http'

export default apiHandler((event) =>
  reviewService().report(reportIdSchema.parse(getRouterParam(event, 'reportId'))),
)
