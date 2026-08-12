# Foresight in production — configuration & verification

The `/scenario-sets` pages pull a project's **published** scenarios from the
external Foresight / Carmelita platform (read-only, server-to-server). Which
project's data appears is decided **entirely by environment variables** — nothing
in code hard-codes it. All reads flow through
[`lib/foresight/client.ts`](../lib/foresight/client.ts), which hits
`/{FORESIGHT_API_URL}/projects/{FORESIGHT_PROJECT_REF}/…` with the
`X-Foresight-Key` header.

Because `.env` / `.env.local` are gitignored, **production has no Foresight
configuration until you add it in Vercel.** That is the required step.

## The three variables

| Variable | Role | Notes |
| --- | --- | --- |
| `FORESIGHT_PROJECT_REF` | **Selects the project.** It is the `ref` in every API path. | Defaults to `nnphi` if unset. Set it **explicitly** in prod so a future default change can't silently repoint you. |
| `FORESIGHT_API_URL` | The Foresight backend host. | May be the bare host (`https://host`) or include `/api/v1/foresight` — the path is appended automatically. Must be a URL Vercel's servers can reach (not `localhost`, not a private host). |
| `FORESIGHT_API_KEY` | Shared secret sent as `X-Foresight-Key`. | Must be the key the **production** backend accepts. Server-only — never exposed to the browser. |

Local development uses `FORESIGHT_URL=http://localhost:8000` in `.env.local`;
that value is **local only** and must not be what production uses.

## Set them in Vercel

Project → Settings → Environment Variables → **Production** (repeat for
**Preview** if you want PR preview deployments to show data — ideally pointed at a
staging project), or via CLI:

```bash
vercel env add FORESIGHT_API_URL     production   # e.g. https://<prod-foresight-host>
vercel env add FORESIGHT_API_KEY     production   # prod shared key
vercel env add FORESIGHT_PROJECT_REF production   # e.g. nnphi
```

Redeploy after changing env vars (Vercel does not apply them to existing
deployments).

## Verify it's pulling the right project

The data is the proof — each `ref` returns a different set of scenarios:

1. Open production `/scenario-sets`. If the listed sets/titles are the ones you
   expect for that project, the ref + URL + key are all correct.
2. The failure panels tell you what's wrong:
   - **"Foresight not configured"** → a variable is missing (`foresightConfigured()`
     requires both `FORESIGHT_API_URL` and `FORESIGHT_API_KEY`).
   - **"platform API couldn't be reached" / "Authentication failed"** → wrong
     `FORESIGHT_API_URL`, unreachable backend, or a bad `FORESIGHT_API_KEY`
     (a 401 is reported explicitly).

## Multi-tenant note

Today every route passes the single `DEFAULT_PROJECT_REF`. To serve multiple
projects from one deployment later, resolve the ref per request (route segment /
passphrase / tenant table) and pass it explicitly to the `getScenario*` helpers —
nothing else in `lib/foresight/client.ts` changes.
