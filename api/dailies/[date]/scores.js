import { cleanDate, ensureDaily, fetchDaily } from '../../_dailies.js'
import { validateScorePayload } from '../../_challenges.js'
import { json, readJson, requireMethod } from '../../_http.js'
import { supabase } from '../../_supabase.js'

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) {
    return
  }

  const dailyDate = cleanDate(req.query.date)

  try {
    const score = validateScorePayload(await readJson(req))
    if (!score) {
      json(res, 400, { error: 'Invalid score payload.' })
      return
    }

    await ensureDaily(dailyDate)
    await supabase('daily_scores', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        daily_date: dailyDate,
        player_id: score.playerId,
        initials: score.initials,
        score: score.score,
        max_score: score.maxScore,
        run_json: score.turns,
      },
    })

    json(res, 201, await fetchDaily(dailyDate))
  } catch (error) {
    json(res, error.status ?? 500, { error: error.message ?? 'Could not submit daily score.' })
  }
}
