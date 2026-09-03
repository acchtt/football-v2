from app.competition_scope import evaluate_competition
from app.config import Settings
from app.model_state import get_model_state
from app.providers.base import TeamProfileSnapshot
from app.providers.normalization import normalize_structural_metrics


def test_canonical_model_state_is_pre_hardening() -> None:
    state = get_model_state()
    assert state.model.version == "v0.2.47-R"
    assert state.model.regime == "PRE-HARDENING"
    assert state.rules.recent_total_leakage_confirmation is True
    assert state.rules.sep1_hardening is False
    assert state.change_control.audit_can_modify_model is False
    assert state.change_control.silent_rule_changes is False
    assert state.change_control.explicit_user_approval_required is True
    assert not any(state.rules.deprecated_restrictions.model_dump().values())


def test_environment_cannot_override_model_identity(monkeypatch) -> None:
    monkeypatch.setenv("MODEL_VERSION", "v9.9.9")
    monkeypatch.setenv("TIMEZONE", "UTC")
    settings = Settings()
    assert settings.model_version == "v0.2.47-R"
    assert settings.model_regime == "PRE-HARDENING"
    assert settings.timezone == "Asia/Ho_Chi_Minh"


def test_named_cup_exceptions_and_domestic_leagues_are_eligible() -> None:
    assert evaluate_competition("Premier League", "GB-ENG").eligible
    assert evaluate_competition("FA Cup", "GB-ENG").eligible
    assert evaluate_competition("Carabao Cup", "GB-ENG").eligible
    assert evaluate_competition("DFB-Pokal", "DE").eligible
    assert evaluate_competition("Leagues Cup", "US").eligible


def test_leagues_cup_exception_runs_before_generic_cup_filter() -> None:
    result = evaluate_competition("North American Leagues Cup", "US")
    assert result.eligible
    assert result.reason == "NAMED_EXCEPTION_LEAGUES_CUP"


def test_other_cups_and_continental_competitions_are_excluded() -> None:
    assert not evaluate_competition("Copa del Rey", "ES").eligible
    assert not evaluate_competition("UEFA Champions League", "INT").eligible
    assert not evaluate_competition("CONMEBOL Libertadores", "INT").eligible


def test_k_league_has_no_legacy_blanket_exclusion() -> None:
    assert evaluate_competition("K League 1", "KR").eligible
    assert evaluate_competition("K League 2", "KR").eligible


def test_short_sample_or_missing_xg_does_not_make_profile_incomplete() -> None:
    profile = TeamProfileSnapshot(
        source_key="test",
        home_gf=1.8,
        home_ga=1.4,
        away_gf=1.6,
        away_ga=1.5,
        recent_gf={"home": 1.9, "away": 1.7},
        recent_ga={"home": 1.5, "away": 1.6},
        scoring_2plus_frequency={"home": 0.5, "away": 0.4},
        conceding_2plus_frequency={"home": 0.4, "away": 0.5},
        clean_sheet_rate={"home": 0.2, "away": 0.2},
        chance_metrics={
            "sample_counts": {
                "home_all": 2,
                "away_all": 2,
                "home_split": 1,
                "away_split": 1,
            },
            "xg_coverage": {"home": 0.0, "away": 0.0},
        },
    )
    metrics = normalize_structural_metrics(profile)
    assert metrics.data_complete is True
    assert metrics.chance_quality == 50.0


def test_missing_mandatory_gf_ga_profile_is_incomplete() -> None:
    profile = TeamProfileSnapshot(
        source_key="test",
        home_gf=None,
        home_ga=1.4,
        away_gf=1.6,
        away_ga=1.5,
    )
    assert normalize_structural_metrics(profile).data_complete is False
