---
id: deploy-aks-service
title: Deploy a service to AKS
summary: Builds, tests and deploys one service to AKS with Helm; production waits for release manager approval.
category: deploy
subcategory: kubernetes
scope: generic
kind: entrypoint
owner: platform-team
status: active
versions:
  - { version: v3, file: .github/workflows/deploy-aks-service-v3.yml, status: current }
  - { version: v2, file: .github/workflows/deploy-aks-service-v2.yml, status: deprecated, superseded_by: v3 }
facets:
  cloud: azure
  environments: [staging, production]
  action: deploy
tags: [helm, blue-green]
aliases: [deploy to kubernetes, release service to aks, ship to aks, helm deploy]
approval:
  environments: [production]
  approvers: Release managers
typical_duration: 12m
related: [rollback-aks-service, restart-pods]
last_reviewed: 2026-10-01
---

## Purpose
Builds a container image for one service, runs its tests, and deploys it to AKS with Helm. Use it for every routine release.

## When to use
- Releasing a new version of a service to staging or production.
- Redeploying the same version after a configuration change.

## When not to use
- Rolling back a bad release: use rollback-aks-service, which skips the build.

## Before you start
You need a version tag that exists in the container registry and, for production, a change ticket.

## Inputs
| Input | Required | Meaning | Example | Notes |
| --- | --- | --- | --- | --- |
| environment | Yes | Where to deploy | production | Production waits for approval |
| version | Yes | Release to deploy | 2.14.0 | Must exist in the registry |
| canary | No | Send part of the traffic first | true | |
| canary_percent | No | Share of traffic for the canary | 10 | 1 to 50 |

## What happens
1. Build image
2. Run unit tests
3. Deploy to the chosen environment (production waits for approval)
4. Smoke test

## Approvals and environments
Production needs approval from a release manager, who checks the change ticket and the staging result.

## Outputs and how to verify
The new pods run the requested version. Check the service dashboard and the smoke test job.

## Troubleshooting
| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Helm upgrade times out | Readiness probe failing | Check pod logs; roll back with rollback-aks-service |

## FAQ
**Can I deploy two services at once?** No; run it once per service.

## Change log
| Date | Version | Change |
| --- | --- | --- |
| 2026-09-12 | v3 | Added canary option |
