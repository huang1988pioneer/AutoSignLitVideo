---
name: LitMedia Flow
description: A light desktop console for scheduled check-ins, account results and local sign-in.
colors:
  rail: "#F9FCFD"
  work-surface: "#F2F7FA"
  surface: "#FFFFFF"
  ink: "#142F40"
  muted-ink: "#4B6575"
  line: "#D4E1E7"
  teal-action: "#006B76"
  teal-action-hover: "#005760"
  schedule-tint: "#DEF3F3"
  caution-surface: "#FFF4DC"
  caution-ink: "#815216"
typography:
  display: { fontFamily: "Inter, sans-serif", fontSize: "32px", fontWeight: 600 }
  title: { fontFamily: "Inter, sans-serif", fontSize: "19px", fontWeight: 600 }
  body: { fontFamily: "Inter, sans-serif", fontSize: "14px" }
  label: { fontFamily: "Inter, sans-serif", fontSize: "13px" }
  mono: { fontFamily: "Menlo, Consolas, monospace" }
rounded:
  action: "7px"
  surface: "10px"
components:
  button-primary: { backgroundColor: "{colors.teal-action}", textColor: "{colors.surface}", rounded: "{rounded.action}" }
  button-secondary: { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.action}" }
  navigation-active: { backgroundColor: "{colors.schedule-tint}", textColor: "{colors.teal-action}", rounded: "{rounded.action}" }
---

# LitMedia Flow

## Workspace

Use an ice-blue canvas, a light navigation rail and white work surfaces with one-pixel dividers. Deep teal identifies the primary command and the selected destination. Account results pair a written status with color. Amber highlights browser verification instructions.

The overview opens with the schedule and manual check-in. Its stepped trace spans midnight to midnight in Taipei time. The three raised sections show the hour in which each scheduled run can start. Results and history come from GitHub Actions. When account results are unavailable, the table heading identifies the local account states.

## Type and controls

Use Inter with Traditional Chinese system fallbacks for navigation and explanatory text. Use monospaced numerals for run times, points and account numbers, and the same face for copyable Secret identifiers. Keep account aliases in the interface font. Long status messages wrap, and truncated aliases expose their full value on hover.

Keep the account table header visible while its rows scroll. Each alias field has an accessible name containing its account number. Keep verification and credential handoff instructions beside their corresponding actions.

## Window sizes

The default window is 1220 × 820. The navigation rail is 208 units wide. At 980 units and below it becomes a 72-unit icon rail with tooltips and accessible names. At 740 units and below the schedule plot moves below the manual action and the four metrics form two columns. The minimum desktop window is 600 × 520.

The native palette and fonts live in [App.axaml](LitMediaFlow/App.axaml). [ConsoleStyles.axaml](LitMediaFlow/ConsoleStyles.axaml) defines control states and responsive layout. [The interface preview](docs/ui-preview.html) shows all four views.
