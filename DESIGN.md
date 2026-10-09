# ARC XI — Liquid Glass Design Contract (demo)

This contract records the approved Impeccable Shape direction for the football schedule. It applies to `demo/liquid-glass` only; it is not production approval.

## Product and visual authority

- The schedule is the primary screen. Real match data, kickoff chronology (Asia/Ho_Chi_Minh), competition and team logos, scores, statuses, filters, navigation and accessibility take precedence over decoration.
- Preserve ARC XI / IVE identity, typography, yellow and pink semantic accents.
- Keep the approved 3840px cosmic wallpaper **unchanged and sharp**.
- Keep the approved Wonyoung + Liz member artwork **unchanged**, foregrounded above the schedule without intercepting pointer events.
- Do not wrap the ARC XI logo or the entire date navigation in a large glass box.

## Material hierarchy

1. **Environment:** existing cosmic image with localized, not global, readability protection. Never blur the wallpaper to fake depth.
2. **Control plane:** Apple-inspired *clear Liquid Glass* applied consistently to selected date, date arrows, status filters, search and menu. Use a transmitted center, refraction-like rim lighting, restrained directional highlights, subtle depth and a lightweight response to real pointer movement.
3. **Schedule glass plane:** a single transparent, raised Liquid Glass reading sheet spans the real fixture list. The sheet has directional specular edging, restrained backdrop blur and a pointer-responsive optical rim; individual competition groups and fixture rows remain clear, non-blurred subdivisions inside the shared material. Readability stays non-negotiable.
4. **Foreground art:** approved IVE artwork positioned independently above the schedule.

## Behavior, quality and anti-goals

- Desktop and mobile must maintain readable real fixtures, keyboard focus, comfortable touch targets and responsive layouts.
- Motion serves state change and interaction; no continuously moving liquid layers, fake magnification, exaggerated distortion or neon conic-gradient outlines.
- Respect reduced-motion, reduced-transparency, higher-contrast settings and browsers without backdrop-filter.
- Never recreate the rejected opaque dark rectangular league cards. The schedule itself must visibly belong to the same Liquid Glass family as its controls: one continuous sheet, subtle optical perimeter, uncluttered divisions and contrast-safe text.
- Screenshot-test the populated real schedule at desktop and mobile widths and verify computed control/material properties before approval.
- Live status must never be conflated with the read-only demo snapshot. Keep production `main` unchanged until explicit approval.
