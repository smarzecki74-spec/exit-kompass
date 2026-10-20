import { json, config } from '../../lib/cms.js';

export async function onRequestGet({ env, data }) {
  const c = config(env);
  return json({ ok: true, user: data.user, exp: data.sessionExp, repo: c.repo, branch: c.branch });
}
