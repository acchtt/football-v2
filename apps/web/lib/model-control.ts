const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:8000";

export type ModelControlState = {
  banner: string;
  model: {
    name: string;
    version: string;
    regime: string;
    timezone: string;
  };
  rules: {
    recent_total_leakage_confirmation: boolean;
    sep1_hardening: boolean;
    chance_quality_role: string;
    h2h_role: string;
    price_can_promote_structure: boolean;
  };
  change_control: {
    audit_can_modify_model: boolean;
    silent_rule_changes: boolean;
    explicit_user_approval_required: boolean;
    production_requires_canonical_state: boolean;
  };
  competition_scope: Record<string, unknown>;
};

export async function getModelControlState(): Promise<ModelControlState> {
  const response = await fetch(`${apiBaseUrl}/api/v1/model/state`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Model state API returned ${response.status}`);
  }
  return (await response.json()) as ModelControlState;
}
