ALTER TABLE lineup_submissions
    ADD COLUMN IF NOT EXISTS uploaded_images JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS original_filenames JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS vision_provider TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN IF NOT EXISTS manually_corrected BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS supersedes_submission_id UUID REFERENCES lineup_submissions(id),
    ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ;

ALTER TABLE odds_submissions
    ADD COLUMN IF NOT EXISTS uploaded_images JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS original_filenames JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS extraction_confidence DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS vision_provider TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN IF NOT EXISTS manually_corrected BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS supersedes_submission_id UUID REFERENCES odds_submissions(id),
    ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ;

ALTER TABLE decision_states
    ADD COLUMN IF NOT EXISTS source_lineup_submission_id UUID REFERENCES lineup_submissions(id),
    ADD COLUMN IF NOT EXISTS source_odds_submission_id UUID REFERENCES odds_submissions(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_decision_source_state
ON decision_states(
    fixture_id,
    model_version,
    period,
    source_lineup_submission_id,
    source_odds_submission_id
);

ALTER TABLE official_bets
    ADD COLUMN IF NOT EXISTS model_version TEXT,
    ADD COLUMN IF NOT EXISTS decision_state_id UUID REFERENCES decision_states(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_official_fixture_version
ON official_bets(fixture_id, model_version);

CREATE UNIQUE INDEX IF NOT EXISTS uq_official_decision_state
ON official_bets(decision_state_id);

DROP TRIGGER IF EXISTS lineup_submissions_append_only ON lineup_submissions;
CREATE TRIGGER lineup_submissions_append_only
BEFORE UPDATE OR DELETE ON lineup_submissions
FOR EACH ROW EXECUTE FUNCTION reject_frozen_mutation();

DROP TRIGGER IF EXISTS odds_submissions_append_only ON odds_submissions;
CREATE TRIGGER odds_submissions_append_only
BEFORE UPDATE OR DELETE ON odds_submissions
FOR EACH ROW EXECUTE FUNCTION reject_frozen_mutation();
