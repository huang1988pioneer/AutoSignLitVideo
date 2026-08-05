---
name: LitMedia Flow
description: A calm, local-first desktop handoff from isolated LitMedia sign-in state to daily check-in automation.
colors:
  graphite-teal: "#10383B"
  rail-teal-hover: "#1E5052"
  rail-teal-active: "#20585A"
  teal-action: "#087F78"
  teal-action-hover: "#056B66"
  work-surface: "#F5F7F8"
  surface: "#FFFFFF"
  surface-muted: "#EEF4F4"
  surface-secondary: "#E7EFEF"
  surface-secondary-hover: "#D5E5E4"
  ink: "#142E38"
  body-ink: "#1C3540"
  muted-ink: "#58707A"
  rail-ink: "#C8DAD8"
  caution-surface: "#FFF4E5"
  caution-ink: "#714D16"
typography:
  display:
    fontFamily: "Inter, sans-serif"
    fontSize: "30px"
    fontWeight: 600
  title:
    fontFamily: "Inter, sans-serif"
    fontSize: "20px"
    fontWeight: 600
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "14px"
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "12px"
  mono:
    fontFamily: "Consolas, monospace"
rounded:
  action: "7px"
  status: "8px"
  navigation: "8px"
  surface: "14px"
spacing:
  compact: "7px"
  small: "10px"
  medium: "14px"
  control: "18px"
  surface: "26px"
  page: "48px"
components:
  button-primary:
    backgroundColor: "{colors.teal-action}"
    textColor: "{colors.surface}"
    rounded: "{rounded.action}"
    padding: "11px 18px"
  button-primary-hover:
    backgroundColor: "{colors.teal-action-hover}"
  button-secondary:
    backgroundColor: "{colors.surface-secondary}"
    textColor: "{colors.body-ink}"
    rounded: "{rounded.action}"
    padding: "10px 15px"
  navigation-active:
    backgroundColor: "{colors.rail-teal-active}"
    textColor: "{colors.surface}"
    rounded: "{rounded.navigation}"
    padding: "11px 13px"
---

# Design System: LitMedia Flow

## Overview

**Creative North Star: "The Local Control Room"**

LitMedia Flow is an Operate-mode desktop interface: quiet, fixed, and honest about what is known locally. A cool graphite-teal rail carries orientation and safety guidance; a soft white work area carries the action sequence, readiness counts, and account-by-account evidence. The restrained teal action color is reserved for deliberate user-triggered handoffs, never remote-success theater.

The UI should feel like a capable desktop companion to an existing automation, not a cloud dashboard. It uses a compact Inter hierarchy, clear tonal surfaces, and explanatory status copy to let users launch check-in or progress through login, account alias, and GitHub Secret setup with confidence.

**Key Characteristics:**

- Fixed dark navigation rail with a scrollable, spacious white workspace.
- Local readiness and account state take precedence over aggregate or opaque remote metrics.
- Flat tonal layering, compact controls, and human-assisted verification language.

## Colors

The palette is a disciplined graphite-and-teal system: dark teal holds permanent navigation, green-teal denotes an explicit operation, and pale aqua surfaces explain state without stealing attention.

### Primary

- **Deliberate Teal:** used for primary commands and configured/ready metric values; reserve it for actions the user actively initiates.
- **Deepened Teal:** the primary-command hover state; use only as feedback on the teal action.

### Neutral

- **Graphite Rail:** the stable left-hand shell and visual anchor for the desktop workflow.
- **Quiet Paper:** the window background that separates the application frame from white content surfaces.
- **White Work Surface:** cards that group one task or one state area.
- **Pale Status Aqua:** inline local-status panels and low-emphasis information.
- **Deep Ink / Muted Ink:** titles and body/supporting copy, respectively; keep the contrast hierarchy intact.
- **Human-Verification Amber:** warning surface and text for OTP, CAPTCHA, or related manual steps.

**The Evidence Before Accent Rule.** Teal signals a real local action or a directly observed readiness value. Do not use it to imply that a remote GitHub workflow has succeeded.

## Typography

**Display Font:** Inter, sans-serif

**Body Font:** Inter, sans-serif

**Label/Mono Font:** Consolas, monospace for generated Secret names only.

**Character:** Inter is compact, neutral, and practical—suited to checking 33 accounts without turning operational data into decoration. Weight and color, rather than oversized type, create hierarchy.

### Hierarchy

- **Display** (600, 30px): screen titles at the top of each workspace view.
- **Title** (600, 20px): card and section headings.
- **Body** (regular, 14px): explanations, navigation labels, and account rows.
- **Label** (regular or 600, 12px): metric labels, rail group labels, and supporting metadata.
- **Metric** (600, 26px; 19px for text status): direct local totals and the current check-in result.

**The Explain, Then Act Rule.** A task card gives a short explanation before its command, so the user knows whether it opens a browser, copies local state, or requires manual verification.

## Layout

The desktop window is designed at 1120 × 780, with a 900 × 640 minimum. A fixed 244px rail occupies the left edge; the right workspace scrolls vertically and suppresses horizontal scrolling. Main content uses a 48px outer inset, a maximum reading width of 760px, and 22px between major groups. The dashboard is intentionally broad enough for three readiness metrics and an account list that can scroll independently up to 300px.

Use the existing rhythm: 7–14px inside compact groups, 20–22px between sections, and 26px inside primary surfaces. Preserve the rail/workspace split on desktop; do not collapse this workflow into a web-style metrics grid.

## Elevation & Depth

This is a flat, tonal system: no shadows are defined. Depth comes from the contrast between quiet paper, white cards, muted informational panels, and the permanent dark rail. Hover states shift fill color instead of lifting controls.

**The Tonal Depth Rule.** Establish hierarchy with surface color and spacing, never with decorative drop shadows or glass effects.

## Shapes

Surfaces are softly rounded (14px), while actions and status panels tighten to 7–8px. The difference makes task containers calm and architectural while keeping clickable controls compact and native-feeling. Borders are not part of the visual language; tonal fill does the grouping work.

## Components

### Buttons

- **Shape:** compact rounded rectangle (7px).
- **Primary:** Deliberate Teal with white semi-bold text and 18px horizontal / 11px vertical padding; one clear user-initiated operation per task group.
- **Hover / Focus:** hover darkens to Deepened Teal. Preserve platform focus behavior from Avalonia Fluent rather than adding a custom glow.
- **Secondary:** pale aqua fill, dark teal text, and 15px horizontal / 10px vertical padding; use for refresh, copying companion values, and non-destructive alternatives.

### Cards / Containers

- **Corner Style:** generous soft corner (14px).
- **Background:** white work surface on quiet paper.
- **Shadow Strategy:** none; tonal separation only.
- **Internal Padding:** 26px in primary task cards.

### Navigation

- **Style:** the graphite-teal rail is fixed and contains product identity, context, four task destinations, and a safety note.
- **Default:** transparent with pale rail text.
- **Hover:** rail-teal hover fill with white text.
- **Active:** rail-teal active fill, white semi-bold text, and an 8px corner.

### Status Panels

- **Style:** pale aqua panels communicate local loading, readiness, and operational detail; use 8px corners and compact 13px / 10px padding.
- **Warning:** human-verification guidance switches to the amber surface and ink; it must say that OTP/CAPTCHA is completed by the user in the browser.

### Secret Identifier

- **Style:** use a pale teal capsule-like panel and Consolas for generated GitHub Secret identifiers, keeping machine-readable names visually distinct from explanatory copy.

## Do's and Don'ts

### Do:

- **Do** keep the 244px graphite-teal rail as the stable orientation layer on desktop.
- **Do** surface account isolation and local readiness clearly, including the 1–33 account range and scrollable status list.
- **Do** use teal for explicit operations and directly observed local counts only.
- **Do** lead every browser/login handoff with concise copy that tells the user what will happen and what remains manual.

### Don't:

- **Don't** represent GitHub Actions or a remote check-in as successful without a direct result the app has actually observed.
- **Don't** add password collection, CAPTCHA bypass, OTP automation, or copy that suggests the app performs those tasks.
- **Don't** introduce dashboard-style charts, heavy shadows, gradients, or large decorative metrics; this is a local operating surface.
- **Don't** turn the four task destinations into oversized cards or hide safety guidance behind secondary navigation.
