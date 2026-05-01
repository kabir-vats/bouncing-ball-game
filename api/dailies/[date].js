import { cleanDate, fetchDaily } from '../_dailies.js'
import { json, requireMethod } from '../_http.js'

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) {
    return
  }

  try {
    json(res, 200, await fetchDaily(cleanDate(req.query.date)))
  } catch (error) {
    json(res, error.status ?? 500, { error: error.message ?? 'Could not load daily challenge.' })
  }
}
