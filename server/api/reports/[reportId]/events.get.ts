import { getQuery, getRouterParam } from 'h3'
import { reportIdSchema } from '../../../../shared/schemas/report'
import { eventsInputSchema } from '../../../services/review'
import { reviewService } from '../../../services/runtime'
import { apiHandler } from '../../../utils/http'

export default apiHandler((event) =>
  reviewService().events(
    reportIdSchema.parse(getRouterParam(event, 'reportId')),
    eventsInputSchema.parse(getQuery(event)),
  ),
)
