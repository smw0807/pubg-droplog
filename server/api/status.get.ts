import { apiHandler } from '../utils/http'
import { runtimeStatus } from '../services/runtime'

export default apiHandler(() => {
  const status = runtimeStatus()
  return { data: status, meta: { source: status.mode } }
})
