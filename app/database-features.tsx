type Example = {
  title: string;
  description: string;
  source: string;
  language?: string;
  code: string;
};

type Feature = {
  id: string;
  label: string;
  summary: string;
  status: string;
  examples: Example[];
};

const schema = 'db/scoutiq_database.txt';
const api = 'app/api/data/route.ts';

export const databaseFeatures: Feature[] = [
  {
    id: 'db-constraints', label: 'Constraints', status: 'Implemented in schema',
    summary: 'Keys, checks and referential actions keep player records, reports and recommendations consistent.',
    examples: [
      {title: 'Primary and foreign keys', description: 'Every statistics row has its own ID and belongs to a player. Deleting a player also removes their statistics.', source: schema,
        code: `-- From player_statistics
stat_id SERIAL PRIMARY KEY,
player_id INT NOT NULL
  REFERENCES players(player_id) ON DELETE CASCADE`},
      {title: 'Unique records', description: 'A player can have one statistics row per season, and a scout can shortlist the same player once.', source: schema,
        code: `-- player_statistics
CONSTRAINT uq_player_season UNIQUE (player_id, season)

-- shortlists
UNIQUE (user_id, player_id)`},
      {title: 'Validation and defaults', description: 'Report ratings are restricted to 1–10 and summaries need at least 30 characters. Recommendations start as pending.', source: schema,
        code: `-- scouting_reports
rating SMALLINT CHECK (rating BETWEEN 1 AND 10),
summary TEXT NOT NULL CHECK (char_length(trim(summary)) >= 30)

-- recommendations
status VARCHAR(10) NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending','approved','rejected','withdrawn'))`},
    ],
  },
  {
    id: 'db-triggers', label: 'Triggers', status: 'Implemented in schema',
    summary: 'Database triggers validate changes, enforce actor rules and record an audit trail automatically.',
    examples: [
      {title: 'Report validation', description: 'Rejects future match dates, limits scout edits to seven days and clears stale embeddings when report text changes.', source: schema,
        code: `CREATE TRIGGER validate_report
BEFORE INSERT OR UPDATE ON scouting_reports
FOR EACH ROW EXECUTE FUNCTION trg_validate_report();`},
      {title: 'Audit history', description: 'Player, report and recommendation changes save the actor and before/after row snapshots in audit_log. Admins see these in Audit log.', source: schema,
        code: `CREATE TRIGGER audit_players
AFTER INSERT OR UPDATE OR DELETE ON players
FOR EACH ROW EXECUTE FUNCTION trg_audit('player_id');

CREATE TRIGGER audit_reports
AFTER INSERT OR UPDATE OR DELETE ON scouting_reports
FOR EACH ROW EXECUTE FUNCTION trg_audit('report_id');

CREATE TRIGGER audit_recommendations
AFTER INSERT OR UPDATE OR DELETE ON recommendations
FOR EACH ROW EXECUTE FUNCTION trg_audit('recommendation_id');`},
      {title: 'Recommendation permissions', description: 'Checks that scouts create their own recommendations and that only the acting admin decides them. Separate rules also validate status changes.', source: schema,
        code: `CREATE TRIGGER recommendation_actor
BEFORE INSERT OR UPDATE ON recommendations
FOR EACH ROW EXECUTE FUNCTION trg_recommendation_actor();

CREATE TRIGGER recommendation_rules
BEFORE INSERT OR UPDATE ON recommendations
FOR EACH ROW EXECUTE FUNCTION trg_recommendation_rules();`},
    ],
  },
  {
    id: 'db-procedures', label: 'Procedures', status: 'Workflows use stored functions',
    summary: 'ScoutIQ implements its multi-step workflows as PL/pgSQL functions named sp_*. They are called with SELECT; the current schema does not define native CREATE PROCEDURE / CALL routines.',
    examples: [
      {title: 'Add a player and first season', description: 'The admin dashboard calls sp_add_player_with_stats to insert a player and their initial statistics together. A failure rolls back the transaction.', source: api,
        code: `SELECT sp_add_player_with_stats(
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
) player_id;`},
      {title: 'Decide a recommendation', description: 'Locks the pending recommendation, saves the admin decision and, on approval, adds or promotes the player on the recommending scout’s shortlist.', source: api,
        code: `SELECT sp_decide_recommendation($1,$2,$3,$4);
-- Parameters: recommendation ID, admin ID, decision, note`},
      {title: 'Transaction boundary', description: 'withActor wraps write operations in a transaction and supplies the signed-in actor to the database triggers. Errors execute ROLLBACK.', source: 'lib/db.ts',
        code: `BEGIN;
SELECT set_config('app.user_id',$1,true),
       set_config('app.role',$2,true);
-- Execute the requested write or stored function.
COMMIT;`},
    ],
  },
  {
    id: 'db-functions', label: 'Functions', status: 'Implemented in schema',
    summary: 'Reusable SQL functions calculate player scores, find similar players and expose the current application actor to triggers.',
    examples: [
      {title: 'Weighted player score', description: 'The player_summary view uses this immutable function to combine goals, assists, report ratings and dribbling. Player directory and leaderboard display the result.', source: schema,
        code: `CREATE FUNCTION fn_player_score(
  p_goals INT, p_assists INT, p_rating NUMERIC, p_dribbling INT
) RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT round((
    least(coalesce(p_goals,0),30)*1.5 +
    least(coalesce(p_assists,0),25)*1.2 +
    coalesce(p_rating,0)*4 + coalesce(p_dribbling,0)*0.2
  )::numeric,1)
$$;`},
      {title: 'Similar players', description: 'The player profile calls fn_similar_players, then applies age and budget filters to the vector similarity results.', source: api,
        code: `SELECT * FROM fn_similar_players($1,100)
WHERE ($2::int IS NULL OR age <= $2)
  AND ($3::numeric IS NULL OR market_value_eur <= $3)
ORDER BY distance LIMIT 5;`},
      {title: 'Current actor', description: 'Reads transaction-local session context so audit and permission triggers can identify the application user.', source: schema,
        code: `CREATE FUNCTION current_app_user() RETURNS INT
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id',true),'')::INT
$$;`},
    ],
  },
  {
    id: 'db-ctes', label: 'CTEs', status: 'Used in similarity function',
    summary: 'A common table expression names an intermediate result so the similarity query can reuse a player’s average report embedding.',
    examples: [
      {title: 'Player embedding profile', description: 'This is the query body of fn_similar_players. WITH profile computes one average vector, then the main query ranks other players by their closest report.', source: schema,
        code: `WITH profile AS (
  SELECT avg(embedding) vector
  FROM scouting_reports
  WHERE player_id = p_player_id AND embedding IS NOT NULL
)
SELECT p.player_id, p.name, p.position, p.age,
       p.market_value_eur,
       min(r.embedding <=> profile.vector) distance
FROM profile
JOIN scouting_reports r ON r.embedding IS NOT NULL
JOIN players p ON p.player_id = r.player_id
WHERE p.player_id <> p_player_id AND profile.vector IS NOT NULL
GROUP BY p.player_id, p.name, p.position, p.age, p.market_value_eur
ORDER BY distance LIMIT p_limit`},
    ],
  },
  {
    id: 'db-ddl', label: 'DDL', status: 'Implemented in schema',
    summary: 'Data Definition Language builds ScoutIQ’s eight tables, extensions, indexes, views and stored routines.',
    examples: [
      {title: 'Tables', description: 'The schema defines users, teams, players, player_statistics, scouting_reports, shortlists, recommendations and audit_log.', source: schema,
        code: `CREATE TABLE teams (
  team_id SERIAL PRIMARY KEY,
  team_name VARCHAR(100) NOT NULL UNIQUE,
  league VARCHAR(100),
  country VARCHAR(100)
);`},
      {title: 'Search extensions and indexes', description: 'pg_trgm supports fuzzy names, unaccent normalizes accents, GIN indexes support text lookup, and pgvector’s HNSW index supports embedding search.', source: schema,
        code: `CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE INDEX ix_players_name_trgm ON players USING GIN(name gin_trgm_ops);
CREATE INDEX ix_reports_search ON scouting_reports USING GIN(search_tsv);
CREATE INDEX ix_reports_embedding
  ON scouting_reports USING hnsw(embedding vector_cosine_ops);`},
      {title: 'Leaderboard view', description: 'The leaderboard reads this view to rank players within their position.', source: schema,
        code: `CREATE VIEW position_leaderboard AS
SELECT player_id, name, position, team_name, score,
       RANK() OVER (PARTITION BY position ORDER BY score DESC) position_rank
FROM player_summary;`},
    ],
  },
  {
    id: 'db-dml', label: 'DML', status: 'Used by application writes',
    summary: 'Data Manipulation Language inserts, updates and deletes scouting records. The API binds values as parameters and runs writes inside withActor transactions.',
    examples: [
      {title: 'INSERT: shortlist a player', description: 'Add to shortlist stores the signed-in user, selected player, priority and notes.', source: api,
        code: `INSERT INTO shortlists(user_id,player_id,priority,notes)
VALUES($1,$2,$3,$4) RETURNING *;`},
      {title: 'UPDATE: edit shortlist details', description: 'Save changes updates only a shortlist row owned by the signed-in user.', source: api,
        code: `UPDATE shortlists SET priority=$1, notes=$2
WHERE shortlist_id=$3 AND user_id=$4 RETURNING *;`},
      {title: 'DELETE: remove a shortlist entry', description: 'Remove deletes the current user’s entry without deleting the player.', source: api,
        code: `DELETE FROM shortlists
WHERE shortlist_id=$1 AND user_id=$2 RETURNING shortlist_id;`},
    ],
  },
  {
    id: 'db-dcl', label: 'DCL', status: 'No GRANT / REVOKE in project schema',
    summary: 'Data Control Language manages database privileges with GRANT and REVOKE. ScoutIQ currently enforces scout/admin permissions in the application and actor triggers; its schema does not configure separate database roles or grants.',
    examples: [
      {title: 'Existing application role checks', description: 'The API checks the authenticated user before allowing admin actions such as recommendation decisions. This is application authorization rather than SQL DCL.', source: api, language: 'TypeScript',
        code: `case 'decide':
  if (user.role !== 'admin') return null;
  await db.query(
    'SELECT sp_decide_recommendation($1,$2,$3,$4)',
    [num(body.id), user.id, text(body.decision), text(body.note)]
  );
  return {ok:true};`},
      {title: 'Existing database actor checks', description: 'Triggers read the application role from the transaction context and validate who may create or decide recommendations.', source: schema,
        code: `CREATE FUNCTION current_app_role() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.role',true),'')
$$;

CREATE TRIGGER recommendation_actor
BEFORE INSERT OR UPDATE ON recommendations
FOR EACH ROW EXECUTE FUNCTION trg_recommendation_actor();`},
    ],
  },
  {
    id: 'db-nosql', label: 'NoSQL', status: 'JSONB in PostgreSQL',
    summary: 'ScoutIQ uses PostgreSQL as its database. Its document-style feature is JSONB audit snapshots; the project does not connect to a separate NoSQL database such as MongoDB.',
    examples: [
      {title: 'Flexible row snapshots', description: 'audit_log stores old and new records as JSONB documents, allowing snapshots from different audited tables in the same columns.', source: schema,
        code: `-- Columns in audit_log
old_data JSONB,
new_data JSONB

-- Expressions used by trg_audit
CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END
CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END`},
      {title: 'Read audit documents', description: 'The schema’s Q12 demonstration retrieves the JSONB documents. The admin Audit log displays these snapshots as Before and After.', source: schema,
        code: `SELECT table_name, action, old_data, new_data
FROM audit_log
ORDER BY changed_at DESC LIMIT 20;`},
    ],
  },
  {
    id: 'db-queries', label: 'Queries', status: 'Used by application reads',
    summary: 'SELECT queries power player profiles, shortlists, aggregates, rankings and report search. Examples below show the project’s joins, grouping, window results and full-text search.',
    examples: [
      {title: 'JOIN: the current scout’s shortlist', description: 'Combines shortlist entries with player and club details. The LEFT JOIN preserves free agents.', source: api,
        code: `SELECT s.*, p.name, p.position, p.age, t.team_name
FROM shortlists s
JOIN players p ON p.player_id=s.player_id
LEFT JOIN teams t ON t.team_id=p.team_id
WHERE s.user_id=$1
ORDER BY s.priority, s.added_at DESC;`},
      {title: 'GROUP BY: club aggregates', description: 'The admin dashboard counts players and computes each club’s average score.', source: api,
        code: `SELECT team_name, count(*) players, round(avg(score),1) average_score
FROM player_summary GROUP BY team_name
ORDER BY average_score DESC NULLS LAST;`},
      {title: 'Window ranking: position leaders', description: 'The leaderboard view calculates RANK per position; the app reads the top three ranks, including ties.', source: api,
        code: `SELECT * FROM position_leaderboard
WHERE position_rank <= 3 ORDER BY position, position_rank;`},
      {title: 'Full-text report search', description: 'The schema’s Q7 demonstration matches report text and orders it by relevance. The Search screen also combines full-text matching with player filters and a separate vector search.', source: schema,
        code: `SELECT report_id,
       ts_rank(search_tsv,websearch_to_tsquery('english','quick pressing')) rank
FROM scouting_reports
WHERE search_tsv @@ websearch_to_tsquery('english','quick pressing')
ORDER BY rank DESC;`},
    ],
  },
];

export function DatabaseFeaturePanel({feature}: {feature: Feature}) {
  return <section className="database-feature" aria-label={`${feature.label} in ScoutIQ`}>
    <div className="card feature-intro">
      <div className="eyebrow">DATABASE FEATURES</div>
      <span className="feature-status">{feature.status}</span>
      <p>{feature.summary}</p>
      <small>Project examples for review. Code shown here is not executed.</small>
    </div>
    <div className="feature-examples">
      {feature.examples.map(example => <article className="card feature-example" key={example.title}>
        <h2>{example.title}</h2>
        <p>{example.description}</p>
        <div className="feature-code-heading"><span>{example.language || 'SQL'}</span><span>Source: {example.source}</span></div>
        <pre tabIndex={0} aria-label={`${example.title} code`}><code>{example.code}</code></pre>
      </article>)}
    </div>
  </section>;
}
