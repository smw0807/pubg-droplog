import { setResponseStatus } from 'h3'
import { createReportInputSchema } from '../../../shared/schemas/report'
import { reviewService } from '../../services/runtime'
import { apiHandler, clientIdentity, smallJsonBody } from '../../utils/http'

export default apiHandler(async (event) => {
  const input = createReportInputSchema.parse(await smallJsonBody(event))
  const result = await reviewService().create(input, clientIdentity(event))
  setResponseStatus(event, result.data.reused ? 200 : 201)
  return result
})
