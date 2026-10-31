-- Run on a fresh database after db/scoutiq_database.txt.
-- Test data stays inside a rolled-back transaction.
BEGIN;
INSERT INTO users(username,password_hash,role) VALUES ('test_scout','test hash','scout'),('test_admin','test hash','admin');
SELECT set_config('app.user_id',(SELECT user_id::text FROM users WHERE username='test_admin'),true);
DO $$ DECLARE p INT; scout INT; admin_id INT; rec INT; BEGIN
  SELECT user_id INTO scout FROM users WHERE username='test_scout';
  SELECT user_id INTO admin_id FROM users WHERE username='test_admin';
  SELECT sp_add_player_with_stats((SELECT team_id FROM teams LIMIT 1),'Test Winger',22,'Winger','England','Right',12000000,'2025-26',12,7,82.5,85) INTO p;
  IF NOT EXISTS (SELECT 1 FROM player_statistics WHERE player_id=p AND goals=12) THEN RAISE EXCEPTION 'Atomic player creation failed'; END IF;
  BEGIN INSERT INTO player_statistics(player_id,season) VALUES(p,'2025-26'); RAISE EXCEPTION 'Duplicate season accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO players(name,age,position) VALUES('Invalid',50,'Winger'); RAISE EXCEPTION 'Invalid age accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO scouting_reports(player_id,scout_id,match_date,summary) VALUES(p,scout,CURRENT_DATE+1,'This is a long enough test report summary.'); RAISE EXCEPTION 'Future match accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='Future match accepted' THEN RAISE; END IF; END;
  INSERT INTO scouting_reports(player_id,scout_id,match_date,rating,summary) VALUES(p,scout,CURRENT_DATE,8,'A quick wide player with excellent pressing and acceleration.');
  INSERT INTO recommendations(player_id,recommended_by,priority,justification) VALUES(p,scout,'high','Strong attacking fit with fast acceleration and reliable pressing.') RETURNING recommendation_id INTO rec;
  BEGIN INSERT INTO recommendations(player_id,recommended_by,priority,justification) VALUES(p,scout,'high','A second recommendation that must fail because one is pending.'); RAISE EXCEPTION 'Duplicate pending recommendation accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
  PERFORM sp_decide_recommendation(rec,admin_id,'approved','Good fit');
  IF NOT EXISTS(SELECT 1 FROM shortlists WHERE user_id=scout AND player_id=p AND priority=1) THEN RAISE EXCEPTION 'Approval did not shortlist'; END IF;
  BEGIN UPDATE recommendations SET status='rejected' WHERE recommendation_id=rec; RAISE EXCEPTION 'Final recommendation changed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='Final recommendation changed' THEN RAISE; END IF; END;
  IF (SELECT count(*) FROM audit_log WHERE record_id=p AND table_name='players')<1 THEN RAISE EXCEPTION 'Audit trigger did not run'; END IF;
  IF NOT EXISTS(SELECT 1 FROM player_summary WHERE player_id=p AND score>0) THEN RAISE EXCEPTION 'Summary view failed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM position_leaderboard WHERE player_id=p AND position_rank=1) THEN RAISE EXCEPTION 'Leaderboard failed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM scouting_reports WHERE player_id=p AND search_tsv @@ websearch_to_tsquery('english','pressing')) THEN RAISE EXCEPTION 'Full-text search failed'; END IF;
END $$;
SELECT 'All database assertions passed' AS result;
ROLLBACK;
