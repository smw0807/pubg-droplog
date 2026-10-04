import { getQuery } from 'h3'
import { searchInputSchema } from '../../../shared/schemas/report'
import { reviewService } from '../../services/runtime'
import { apiHandler } from '../../utils/http'

export default apiHandler(event => {
  const input = searchInputSchema.parse(getQuery(event))
  return reviewService().search(input.platform, input.name)
})
