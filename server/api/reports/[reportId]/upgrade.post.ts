import { getRouterParam, setResponseStatus } from 'h3'
import { z } from 'zod'
import { reviewService } from '../../../services/runtime'
import { apiHandler, clientIdentity } from '../../../utils/http'

export default apiHandler(async (event) => {
  const result = await reviewService().upgrade(
    z.string().uuid().parse(getRouterParam(event, 'reportId')),
    clientIdentity(event),
  )
  setResponseStatus(event, result.data.reused ? 200 : 201)
  return result
})
