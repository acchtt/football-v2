CREATE TABLE IF NOT EXISTS fixtures (
    id UUID PRIMARY KEY,
    provider_fixture_id TEXT UNIQUE NOT NULL,
    provider_name TEXT NOT NULL,
    competition TEXT NOT NULL,
    country_code TEXT NOT NULL,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    kickoff_utc TIMESTAMPTZ NOT NULL,
    kickoff_ict TIMESTAMPTZ NOT NULL,
    kickoff_ict_date DATE NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_fixtures_kickoff_ict_date ON fixtures(kickoff_ict_date);

CREATE TABLE IF NOT EXISTS team_profiles (
    id UUID PRIMARY KEY,
    fixture_id UUID NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
    source_key TEXT NOT NULL,
    home_gf DOUBLE PRECISION,
    home_ga DOUBLE PRECISION,
    away_gf DOUBLE PRECISION,
    away_ga DOUBLE PRECISION,
    recent_gf JSONB NOT NULL DEFAULT '{}'::jsonb,
    recent_ga JSONB NOT NULL DEFAULT '{}'::jsonb,
    scoring_2plus_frequency JSONB NOT NULL DEFAULT '{}'::jsonb,
    conceding_2plus_frequency JSONB NOT NULL DEFAULT '{}'::jsonb,
    clean_sheet_rate JSONB NOT NULL DEFAULT '{}'::jsonb,
    home_split JSONB NOT NULL DEFAULT '{}'::jsonb,
    away_split JSONB NOT NULL DEFAULT '{}'::jsonb,
    chance_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(fixture_id, source_key)
);

CREATE TABLE IF NOT EXISTS structural_assessments (
    id UUID PRIMARY KEY,
    fixture_id UUID NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
    model_version TEXT NOT NULL,
    structural_grade TEXT NOT NULL,
    structural_type TEXT NOT NULL,
    structural_score DOUBLE PRECISION NOT NULL,
    assessment_status TEXT NOT NULL,
    display_on_board BOOLEAN NOT NULL DEFAULT false,
    failure_modes JSONB NOT NULL DEFAULT '[]'::jsonb,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    exclusion_reason TEXT,
    frozen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(fixture_id, model_version)
);

CREATE TABLE IF NOT EXISTS lineup_submissions (
    id UUID PRIMARY KEY,
    fixture_id UUID NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
    uploaded_image TEXT NOT NULL,
    uploaded_images JSONB NOT NULL DEFAULT '[]'::jsonb,
    original_filenames JSONB NOT NULL DEFAULT '[]'::jsonb,
    extracted_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    extraction_confidence DOUBLE PRECISION,
    vision_provider TEXT NOT NULL DEFAULT 'unknown',
    manually_corrected BOOLEAN NOT NULL DEFAULT false,
    supersedes_submission_id UUID REFERENCES lineup_submissions(id),
    corrected_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS odds_submissions (
    id UUID PRIMARY KEY,
    fixture_id UUID NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
    uploaded_image TEXT NOT NULL,
    uploaded_images JSONB NOT NULL DEFAULT '[]'::jsonb,
    original_filenames JSONB NOT NULL DEFAULT '[]'::jsonb,
    extracted_lines_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    extraction_confidence DOUBLE PRECISION,
    vision_provider TEXT NOT NULL DEFAULT 'unknown',
    manually_corrected BOOLEAN NOT NULL DEFAULT false,
    supersedes_submission_id UUID REFERENCES odds_submissions(id),
    corrected_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS decision_states (
    id UUID PRIMARY KEY,
    fixture_id UUID NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
    model_version TEXT NOT NULL,
    period TEXT NOT NULL,
    minute INTEGER,
    score TEXT,
    verdict TEXT NOT NULL,
    grade TEXT NOT NULL,
    selected_line DOUBLE PRECISION,
    selected_odds DOUBLE PRECISION,
    evidence_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_lineup_submission_id UUID REFERENCES lineup_submissions(id),
    source_odds_submission_id UUID REFERENCES odds_submissions(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_decision_source_state
ON decision_states(
    fixture_id,
    model_version,
    period,
    source_lineup_submission_id,
    source_odds_submission_id
);

CREATE TABLE IF NOT EXISTS official_bets (
    id UUID PRIMARY KEY,
    fixture_id UUID NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
    model_version TEXT NOT NULL,
    decision_state_id UUID UNIQUE NOT NULL REFERENCES decision_states(id),
    selected_line DOUBLE PRECISION NOT NULL,
    selected_odds DOUBLE PRECISION NOT NULL,
    stake_units DOUBLE PRECISION NOT NULL DEFAULT 1,
    locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    settlement TEXT,
    pnl_units DOUBLE PRECISION,
    UNIQUE(fixture_id, model_version)
);

CREATE OR REPLACE FUNCTION reject_frozen_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS structural_assessments_append_only ON structural_assessments;
CREATE TRIGGER structural_assessments_append_only
BEFORE UPDATE OR DELETE ON structural_assessments
FOR EACH ROW EXECUTE FUNCTION reject_frozen_mutation();

DROP TRIGGER IF EXISTS decision_states_append_only ON decision_states;
CREATE TRIGGER decision_states_append_only
BEFORE UPDATE OR DELETE ON decision_states
FOR EACH ROW EXECUTE FUNCTION reject_frozen_mutation();

DROP TRIGGER IF EXISTS lineup_submissions_append_only ON lineup_submissions;
CREATE TRIGGER lineup_submissions_append_only
BEFORE UPDATE OR DELETE ON lineup_submissions
FOR EACH ROW EXECUTE FUNCTION reject_frozen_mutation();

DROP TRIGGER IF EXISTS odds_submissions_append_only ON odds_submissions;
CREATE TRIGGER odds_submissions_append_only
BEFORE UPDATE OR DELETE ON odds_submissions
FOR EACH ROW EXECUTE FUNCTION reject_frozen_mutation();
