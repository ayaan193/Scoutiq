-- ScoutIQ reproducible demo seed. Run after scoutiq_database.txt:
-- psql ... -v demo_password='choose-a-demo-password' -v ON_ERROR_STOP=1 -f db/seed.sql
-- Player facts checked against UEFA 2026/27 UCL player pages on 2026-10-30.
-- The statistics season is UEFA Champions League 2026/27 to date, not domestic league totals.
-- Club/age/broad UEFA position/goals/assists/pass accuracy are sourced.
-- Specific positions, market value, preferred foot and dribbling below are explicitly estimated demo values.
-- Scout users, reports, shortlists and recommendations are synthetic demonstration data.
-- This seed is for a local classroom demo. Use distinct passwords for real accounts.
\encoding UTF8
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Keep fuzzy player-name search available when seeding an older ScoutIQ database.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE INDEX IF NOT EXISTS ix_players_name_trgm ON players USING GIN(name gin_trgm_ops);
SELECT set_config('scoutiq.demo_password', :'demo_password', true);

INSERT INTO teams(team_name,league,country) VALUES
 ('Manchester City','Premier League','England'),('Inter','Serie A','Italy'),('Real Madrid','La Liga','Spain'),
 ('Liverpool','Premier League','England'),('Manchester United','Premier League','England'),
 ('Paris Saint-Germain','Ligue 1','France'),('Borussia Dortmund','Bundesliga','Germany')
ON CONFLICT (team_name) DO NOTHING;

INSERT INTO users(username,password_hash,role)
SELECT 'demo_admin_'||n,crypt(current_setting('scoutiq.demo_password'),gen_salt('bf',12)),'admin' FROM generate_series(1,2) n
UNION ALL
SELECT 'demo_scout_'||n,crypt(current_setting('scoutiq.demo_password'),gen_salt('bf',12)),'scout' FROM generate_series(1,8) n
ON CONFLICT(username) DO NOTHING;

-- Repair three previously misencoded demo names before matching seed rows by name.
-- Hex UTF-8 literals avoid dependence on the Windows terminal code page.
UPDATE players p SET name=convert_from(decode('56696b746f72204779c3b66b65726573','hex'),'UTF8')
FROM teams t WHERE p.team_id=t.team_id AND t.team_name='Arsenal' AND p.name LIKE 'Viktor Gy%'
AND p.name<>convert_from(decode('56696b746f72204779c3b66b65726573','hex'),'UTF8');
UPDATE players p SET name=convert_from(decode('4c61757461726f204d617274c3ad6e657a','hex'),'UTF8')
FROM teams t WHERE p.team_id=t.team_id AND t.team_name='Inter' AND p.name LIKE 'Lautaro Mart%'
AND p.name<>convert_from(decode('4c61757461726f204d617274c3ad6e657a','hex'),'UTF8');
UPDATE players p SET name=convert_from(decode('4b796c69616e204d62617070c3a9','hex'),'UTF8')
FROM teams t WHERE p.team_id=t.team_id AND t.team_name='Real Madrid' AND p.name LIKE 'Kylian Mbapp%'
AND p.name<>convert_from(decode('4b796c69616e204d62617070c3a9','hex'),'UTF8');

-- One row per player; each URL supports the adjacent 2026/27 statistics.
-- https://www.uefa.com/uefachampionsleague/clubs/players/250106939--bukayo-saka/
-- https://www.uefa.com/uefachampionsleague/clubs/players/250105927--viktor-gyokeres/
-- https://www.uefa.com/uefachampionsleague/clubs/players/250176450--lamine-yamal/
-- https://www.uefa.com/uefachampionsleague/clubs/players/250112880--raphinha/
-- https://www.uefa.com/uefachampionsleague/clubs/players/250103758--erling-haaland/
-- https://www.uefa.com/uefachampionsleague/clubs/players/250101534--phil-foden/
-- https://www.uefa.com/uefachampionsleague/clubs/players/250118281--lautaro-martinez/
-- https://www.uefa.com/uefachampionsleague/clubs/players/250173062--ange-yoan-bonny/
-- https://www.uefa.com/uefachampionsleague/clubs/players/250076574--kylian-mbappe/
-- https://www.uefa.com/uefachampionsleague/clubs/players/250194573--endrick/
WITH sourced(name,club,age,position,nationality,goals,assists,pass_accuracy) AS (VALUES
 ('Bukayo Saka','Arsenal',25,'Forward','England',1,1,85.00),
 ('Viktor Gyökeres','Arsenal',28,'Forward','Sweden',0,1,70.34),
 ('Lamine Yamal','Barcelona',19,'Forward','Spain',2,4,80.00),
 ('Raphinha','Barcelona',29,'Forward','Brazil',2,0,94.50),
 ('Erling Haaland','Manchester City',26,'Forward','Norway',4,0,69.50),
 ('Phil Foden','Manchester City',26,'Midfielder','England',3,1,90.50),
 ('Lautaro Martínez','Inter',29,'Forward','Argentina',2,1,95.00),
 ('Ange-Yoan Bonny','Inter',23,'Forward','Ivory Coast',1,0,76.34),
 ('Kylian Mbappé','Real Madrid',27,'Forward','France',3,1,83.67),
 ('Endrick','Real Madrid',20,'Forward','Brazil',1,1,55.00)
), inserted AS (
 INSERT INTO players(team_id,name,age,position,nationality)
 SELECT t.team_id,s.name,s.age,s.position,s.nationality FROM sourced s JOIN teams t ON t.team_name=s.club
 WHERE NOT EXISTS(SELECT 1 FROM players p WHERE p.name=s.name AND p.team_id=t.team_id)
 RETURNING player_id
)
SELECT count(*) AS players_inserted FROM inserted;

WITH sourced(name,goals,assists,pass_accuracy) AS (VALUES
 ('Bukayo Saka',1,1,85.00),('Viktor Gyökeres',0,1,70.34),('Lamine Yamal',2,4,80.00),
 ('Raphinha',2,0,94.50),('Erling Haaland',4,0,69.50),('Phil Foden',3,1,90.50),
 ('Lautaro Martínez',2,1,95.00),('Ange-Yoan Bonny',1,0,76.34),
 ('Kylian Mbappé',3,1,83.67),('Endrick',1,1,55.00)
)
INSERT INTO player_statistics(player_id,season,goals,assists,pass_accuracy)
SELECT p.player_id,'2026-27',s.goals,s.assists,s.pass_accuracy FROM sourced s JOIN players p ON p.name=s.name
ON CONFLICT(player_id,season) DO NOTHING;

-- Classroom estimates: useful spread for position, age, value and score filters.
-- These are illustrative values, not verified transfer valuations or measured dribbling statistics.
WITH estimates(name,position,preferred_foot,market_value_eur,dribbling) AS (VALUES
 ('Bukayo Saka','Winger','Left',120000000::numeric,88),
 ('Viktor Gyökeres','Striker','Right',65000000::numeric,74),
 ('Lamine Yamal','Winger','Left',160000000::numeric,95),
 ('Raphinha','Winger','Left',80000000::numeric,86),
 ('Erling Haaland','Striker','Left',180000000::numeric,75),
 ('Phil Foden','Attacking Midfielder','Left',85000000::numeric,90),
 ('Lautaro Martínez','Striker','Right',90000000::numeric,80),
 ('Ange-Yoan Bonny','Striker','Right',18000000::numeric,72),
 ('Kylian Mbappé','Winger','Right',170000000::numeric,94),
 ('Endrick','Striker','Left',35000000::numeric,82)
)
UPDATE players p SET position=e.position,
 preferred_foot=coalesce(p.preferred_foot,e.preferred_foot),
 market_value_eur=coalesce(p.market_value_eur,e.market_value_eur)
FROM estimates e WHERE p.name=e.name AND (p.position IS DISTINCT FROM e.position OR p.preferred_foot IS NULL OR p.market_value_eur IS NULL);

WITH estimates(name,dribbling) AS (VALUES
 ('Bukayo Saka',88),('Viktor Gyökeres',74),('Lamine Yamal',95),('Raphinha',86),
 ('Erling Haaland',75),('Phil Foden',90),('Lautaro Martínez',80),
 ('Ange-Yoan Bonny',72),('Kylian Mbappé',94),('Endrick',82)
)
UPDATE player_statistics s SET dribbling=e.dribbling FROM estimates e JOIN players p ON p.name=e.name
WHERE s.player_id=p.player_id AND s.season='2026-27' AND s.dribbling IS NULL;

-- Fictional reports with valid past match dates. They are examples for the app, not claims about real matches.
WITH notes(name,scout,summary,strengths,weaknesses) AS (VALUES
 ('Bukayo Saka',1,'Demo assessment: dynamic wide forward who carries into space and creates chances.','Ball carrying and chance creation','Defensive tracking'),
 ('Viktor Gyökeres',2,'Demo assessment: direct central forward who attacks space and holds the ball well.','Runs behind and physical hold-up','Combination play'),
 ('Lamine Yamal',3,'Demo assessment: creative wide forward with close control and incisive final passes.','Dribbling and passing','Aerial play'),
 ('Raphinha',4,'Demo assessment: energetic forward who presses high and makes dangerous runs.','Pressing and movement','Aerial duels'),
 ('Erling Haaland',5,'Demo assessment: penalty-box striker with powerful running and clinical finishing.','Finishing and movement','Deep buildup'),
 ('Phil Foden',6,'Demo assessment: attacking midfielder with quick turns and accurate combinations.','Close control and vision','Physical duels'),
 ('Lautaro Martínez',7,'Demo assessment: mobile striker who links play and finds shots in crowded areas.','Movement and finishing','Aerial reach'),
 ('Ange-Yoan Bonny',8,'Demo assessment: young forward with strong frame and promising link-up play.','Hold-up and energy','Decision speed'),
 ('Kylian Mbappé',1,'Demo assessment: explosive forward who breaks defensive lines with speed and movement.','Acceleration and finishing','Defensive pressing'),
 ('Endrick',2,'Demo assessment: young forward with sharp acceleration and direct attacking runs.','Burst and shot selection','Experience')
)
INSERT INTO scouting_reports(player_id,scout_id,match_date,opponent,rating,strengths,weaknesses,summary)
SELECT p.player_id,u.user_id,CURRENT_DATE-1,'Demo opponent',7,n.strengths,n.weaknesses,n.summary
FROM notes n JOIN players p ON p.name=n.name JOIN users u ON u.username='demo_scout_'||n.scout
WHERE NOT EXISTS(SELECT 1 FROM scouting_reports r WHERE r.player_id=p.player_id AND r.scout_id=u.user_id AND r.summary=n.summary);

-- Vary fictional opponents, dates and ratings for report filtering and rating aggregates.
UPDATE scouting_reports r SET
 match_date=CURRENT_DATE-((r.player_id % 5)+1),
 opponent=CASE r.player_id % 4 WHEN 0 THEN 'Demo vs Barcelona' WHEN 1 THEN 'Demo vs Arsenal' WHEN 2 THEN 'Demo vs Inter' ELSE 'Demo vs Manchester City' END,
 rating=(6+(r.player_id % 5))::smallint
WHERE r.summary LIKE 'Demo assessment:%' AND r.opponent='Demo opponent';

WITH picks(name,scout,priority) AS (VALUES
 ('Bukayo Saka',1,1),('Viktor Gyökeres',2,2),('Lamine Yamal',3,1),('Raphinha',4,3),
 ('Erling Haaland',5,1),('Phil Foden',6,2),('Lautaro Martínez',7,2),('Ange-Yoan Bonny',8,4),
 ('Kylian Mbappé',1,1),('Endrick',2,3)
)
INSERT INTO shortlists(user_id,player_id,priority,notes)
SELECT u.user_id,p.player_id,picks.priority,'Synthetic demo shortlist' FROM picks
JOIN users u ON u.username='demo_scout_'||picks.scout JOIN players p ON p.name=picks.name
ON CONFLICT(user_id,player_id) DO NOTHING;

WITH picks(name,scout,priority) AS (VALUES
 ('Bukayo Saka',1,'high'),('Viktor Gyökeres',2,'medium'),('Lamine Yamal',3,'high'),
 ('Raphinha',4,'medium'),('Erling Haaland',5,'high'),('Phil Foden',6,'medium'),
 ('Lautaro Martínez',7,'medium'),('Ange-Yoan Bonny',8,'low'),
 ('Kylian Mbappé',1,'high'),('Endrick',2,'low')
)
INSERT INTO recommendations(player_id,recommended_by,priority,justification)
SELECT p.player_id,u.user_id,picks.priority,
 'Synthetic demo recommendation for '||p.name||': review this player in the recruitment meeting after additional live scouting.'
FROM picks JOIN users u ON u.username='demo_scout_'||picks.scout JOIN players p ON p.name=picks.name
WHERE NOT EXISTS(SELECT 1 FROM recommendations r WHERE r.player_id=p.player_id AND r.recommended_by=u.user_id);

-- Mixed synthetic outcomes make approval-rate, queue and audit queries demonstrable.
DO $$ DECLARE target_id INT; admin_id INT; BEGIN
 SELECT user_id INTO admin_id FROM users WHERE username='demo_admin_1';
 SELECT r.recommendation_id INTO target_id FROM recommendations r JOIN players p ON p.player_id=r.player_id WHERE p.name='Bukayo Saka' AND r.status='pending';
 IF target_id IS NOT NULL THEN PERFORM sp_decide_recommendation(target_id,admin_id,'approved','Synthetic demo approval: proceed to the next scouting stage.'); END IF;
 SELECT r.recommendation_id INTO target_id FROM recommendations r JOIN players p ON p.player_id=r.player_id WHERE p.name='Lamine Yamal' AND r.status='pending';
 IF target_id IS NOT NULL THEN PERFORM sp_decide_recommendation(target_id,admin_id,'approved','Synthetic demo approval: shortlist for further review.'); END IF;
 SELECT r.recommendation_id INTO target_id FROM recommendations r JOIN players p ON p.player_id=r.player_id WHERE p.name='Raphinha' AND r.status='pending';
 IF target_id IS NOT NULL THEN PERFORM sp_decide_recommendation(target_id,admin_id,'rejected','Synthetic demo rejection: revisit after a later scouting window.'); END IF;
 UPDATE recommendations SET status='withdrawn',decided_at=now(),decision_note='Synthetic demo withdrawal by scout.'
 WHERE recommendation_id IN (SELECT r.recommendation_id FROM recommendations r JOIN players p ON p.player_id=r.player_id WHERE p.name='Endrick' AND r.status='pending');
END $$;

-- Fail the seed if any of the eight relations has fewer than ten rows.
DO $$ DECLARE table_name TEXT; row_count INT; BEGIN
 FOR table_name IN SELECT unnest(ARRAY['users','teams','players','player_statistics','scouting_reports','shortlists','recommendations','audit_log']) LOOP
  EXECUTE format('SELECT count(*) FROM %I',table_name) INTO row_count;
  IF row_count<10 THEN RAISE EXCEPTION '% has only % rows; expected at least 10',table_name,row_count; END IF;
 END LOOP;
END $$;
COMMIT;

SELECT 'users' relation,count(*) rows FROM users UNION ALL SELECT 'teams',count(*) FROM teams UNION ALL SELECT 'players',count(*) FROM players UNION ALL SELECT 'player_statistics',count(*) FROM player_statistics UNION ALL SELECT 'scouting_reports',count(*) FROM scouting_reports UNION ALL SELECT 'shortlists',count(*) FROM shortlists UNION ALL SELECT 'recommendations',count(*) FROM recommendations UNION ALL SELECT 'audit_log',count(*) FROM audit_log ORDER BY relation;
