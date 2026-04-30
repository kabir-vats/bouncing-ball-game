import { fetchChallenge, createSlug, validateScorePayload } from './_challenges.js'
import { json, readJson, requireMethod } from './_http.js'
import { supabase } from './_supabase.js'

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) {
    return
  }

  try {
    const body = await readJson(req)
    const score = validateScorePayload(body)
    const seed = Number(body.seed)

    if (!score || !Number.isSafeInteger(seed) || seed < 0) {
      json(res, 400, { error: 'Invalid challenge payload.' })
      return
    }

    const slug = createSlug()
    await supabase('challenges', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        slug,
        seed,
        creator_player_id: score.playerId,
        creator_initials: score.initials,
        creator_score: score.score,
      },
    })

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
    json(res, error.status ?? 500, { error: error.message ?? 'Could not create challenge.' })
  }
}
