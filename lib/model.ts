export const MODEL = {
  version: "Football v0.2.47-R",
  regime: "PRE-HARDENING",
  timezone: "Asia/Ho_Chi_Minh",
  recentTotalLeakageConfirmation: true,
  sep1Hardening: false,
  minimumOverPrice: 1.7,
  maximumOverPrice: 2.3,
  gradeBasedMaximumLineEnabled: false,
  principles: [
    "Structure before price",
    "Missing confirmation lowers priority",
    "xG and chance quality support repeatability; they are not blanket vetoes",
    "H2H is a modifier only",
    "XI names cannot create an unsupported scoring route",
    "Use the lowest clean burden only after structure validates the line"
  ],
  workflow: [
    "DISCOVERED",
    "PRE_SCREENED",
    "PRE_FROZEN",
    "WAITING_XI",
    "XI_CONFIRMED",
    "XI_RERANKED",
    "WAITING_MARKET",
    "MARKET_RECEIVED",
    "OFFICIAL_LOCK_OR_HOLD",
    "SETTLED"
  ]
} as const;

export type ModelStage = (typeof MODEL.workflow)[number];
