import { cleanSlug, fetchChallenge, validateScorePayload } from '../../_challenges.js'
import { json, readJson, requireMethod } from '../../_http.js'
import { supabase } from '../../_supabase.js'

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) {
    return
  }

  const slug = cleanSlug(req.query.slug)

  try {
    const score = validateScorePayload(await readJson(req))
    if (!score || !slug) {
      json(res, 400, { error: 'Invalid score payload.' })
      return
    }

    await supabase('challenge_scores', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        challenge_slug: slug,
        player_id: score.playerId,
        initials: score.initials,
        score: score.score,
        max_score: score.maxScore,
        run_json: score.turns,
      },
    })

    json(res, 201, await fetchChallenge(slug))
  } catch (error) {
    json(res, error.status ?? 500, { error: error.message ?? 'Could not submit score.' })
  }
}
