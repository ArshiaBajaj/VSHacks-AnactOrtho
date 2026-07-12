# HooperIQ — Real film IQ training

## In the app: `/iq`

1. **YouTube game film** plays from a start mark  
2. **Auto-freezes** on the decision timestamp  
3. **Draw** coverages / paths on the freeze  
4. **Describe** the read in your own words  
5. Coach returns **what you got · mistake · consequence · correct read**  
6. IQ updates (Glicko-2); weak concepts get more reps  

Also: **Coach annotate** tab — paste any YouTube URL, freeze, save true read + consequence.

## Supabase (persistence)

Schema + RLS live under `hooperiq/supabase/`. The Cursor agent cannot call `api.supabase.com` from its sandbox, so create the cloud project from **your** terminal:

```bash
# once: supabase login
./hooperiq/create-supabase.sh
```

That script will:

1. Create (or reuse) a free project named `hooperiq`
2. Push migrations (`users`, `user_iq_stats`, `basketball_plays`, campaigns, assessments, RLS)
3. Seed demo coach/player + sample plays
4. Write `apps/web/.env.local` with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`

Then restart the web app (`npm run dev`). `/iq` syncs IQ stats + assessments to Supabase when configured; offline localStorage still works.

Manual alternative:

```bash
cd hooperiq
supabase link --project-ref <YOUR_REF>
supabase db push --include-all
# paste supabase/seed.sql in the SQL editor if needed
```

## Code

- `apps/web/src/features/hooperiq/` — full feature  
- `apps/web/src/lib/supabase.ts` — client  
- `apps/server` `POST /api/hooperiq/assess` — optional rich grading  
- `hooperiq/db/` — raw Postgres SQL (same schema as supabase migrations)
