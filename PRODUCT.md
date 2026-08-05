# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

LitMedia users who maintain one or more accounts and need a safe way to capture login state for their existing automated daily check-in workflow.

## Product Purpose

LitMedia Flow is a desktop companion for the repository's Playwright automation. It launches an interactive sign-in, saves an isolated storage state per account, and places the corresponding GitHub Secret value on the clipboard.

## Positioning

The tool makes the existing local Playwright workflow approachable without exposing passwords or attempting to bypass CAPTCHA, OTP, or other human verification.

## Operating Context

Users work at a desktop before configuring GitHub Actions. The underlying repository contains Node.js and Playwright scripts for LitMedia check-in.

## Capabilities and Constraints

- Supports numbered accounts 1 through 33, each with its own storage-state file.
- Runs the existing `npm run auth -- N` flow and exports Base64 through the OS clipboard.
- Uses GitHub CLI when available to open the repository Actions page.
- Does not collect or save passwords, bypass verification, or automatically interact with CAPTCHA.

## Brand Commitments

Inferred from the supplied reference project: a calm, teal-accented desktop workflow with a sidebar and three-step sign-in handoff.

## Evidence on Hand

Existing Playwright scripts and README in this repository; supplied reference repository `huang1988pioneer/AutoSignOiiOii`.

## Product Principles

- Keep every account isolated.
- Make the safe, human-assisted action explicit.
- Make each GitHub Secret handoff unambiguous.
- Prefer clear run status over decorative dashboards.
