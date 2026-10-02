# ARC XI schedule reference implementation

The approved ARCXI_REFERENCE.png is the visual specification. Match data remains live; reference fixtures are never substituted for operational Board rows.

At the reference's 1672px width, the schedule canvas is 1421px wide (85vw), with its left edge at 125px. The masthead occupies 140px, filters 40px, and the first competition header ends at 239px. Rows are 42px, group gaps 18px, crests 34px. The score center sits at approximately 52% of the viewport; home and away names balance around it. Mobile rows wrap names and retain day arrows, status counts, search, and manual score actions.

| Reference role | Implementation |
| --- | --- |
| ARC XI wordmark | SVG outlines traced from the approved wordmark, including the star/slash and signature line |
| UI / team names | Self-hosted variable DM Sans, regular 400; closest practical open-source grotesk substitute |
| Competition labels | DM Sans 650, uppercase, 0.28em tracking |
| Times / scores | DM Sans with tabular figures |
| Date labels | Two lines: weekday, then month/day |
| Yellow / pink / background | #fff000 / #f52c91 / #0a0a0a |

The unchanged reference artwork is displayed through two softly masked CSS windows: the upper-left crown/light field and the lower handwritten signature/light streak below all reference match rows. These windows exclude all reference faces and schedule UI. The crown uses screen blending and a radial fade instead of a hard polygon cutoff. The lower-right photograph comes from the existing approved ive-right-approved.webp, with a radial fade on every exposed edge and no rectangular border; cropping and opacity are CSS-only. No faces are synthesized or retouched.

The single schedule stylesheet replaces all previous schedule-only patch layers. Legacy detail views keep their styles. BSD and Soccerway matching, normalization, Board capacity/tier rules, scores and dates are unchanged. All provider images share the existing restrained fallback. Manual score controls are outside links and become visible on hover or keyboard focus; on mobile they remain visible.

PWA is still disabled. The native hamburger discloses existing navigation and score refresh. No new library or framework is introduced.

Run `node scripts/check-schedule.cjs` for the renderer checks. The Pages workflow also validates required assets and JavaScript syntax before publishing.
