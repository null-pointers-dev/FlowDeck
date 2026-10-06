---
id: family-id
title: Verb-first title, under 60 characters
summary: One sentence, under 160 characters. Shown in search results.
category: deploy
subcategory: kubernetes
scope: generic            # generic | specific
kind: entrypoint          # entrypoint | reusable | internal
owner: platform-team
status: active            # active | deprecated | retired
versions:
  - { version: v1, file: .github/workflows/family-id.yml, status: current }
facets:
  cloud: azure
  environments: [dev, staging, production]
  action: deploy          # deploy | rollback | provision | rotate | scan | maintain
tags: []
aliases: [words people type, another phrase, a third]
approval:
  environments: [production]
  approvers: Release managers
typical_duration: 10m
related: []
last_reviewed: 2026-10-01
---

## Purpose
Two or three sentences: what it does, for whom, and the result.

## When to use
- Situations, in the words people use.

## When not to use
- Situation, and the workflow to use instead.

## Before you start
Access, approvals, artefacts or tickets needed first.

## Inputs
| Input | Required | Meaning | Example | Notes |
| --- | --- | --- | --- | --- |

## What happens
1. Stage one
2. Stage two

## Approvals and environments
Which environments need approval, who approves, what they check.

## Outputs and how to verify
What changes, where to look, how to confirm success.

## Troubleshooting
| Symptom | Likely cause | Fix |
| --- | --- | --- |

## FAQ
**Question as people ask it?** Short answer.

## Change log
| Date | Version | Change |
| --- | --- | --- |
