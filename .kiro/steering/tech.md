---
title: Technology Stack (AWS-Native)
inclusion: always
---

# Technology Stack — AWS-Native

This project is built AWS-native to showcase AWS services. Use the services below for all designs and implementations.

## Non-negotiable: AWS behind adapters, runs locally with mocks

- Every AWS service integration MUST sit behind an adapter interface (per the Engineering Principles steering), with TWO implementations: a live AWS adapter and a deterministic local/mock adapter.
- The application MUST run end-to-end locally using the mock/local adapters with NO live AWS credentials. Live AWS implementations are selected via configuration / dependency injection only.
- Rationale: the demo cannot depend on live cloud uptime. Mocks guarantee a reliable, key-free demo while the AWS integrations remain real and swappable.

## Stack

- **Language:** TypeScript end-to-end — React frontend, Node.js Lambda handlers, CDK infrastructure (one language across the stack). (May be swapped to Python if preferred; keep one language across the backend.)
- **Frontend:** React, hosted via AWS Amplify Hosting (or S3 + CloudFront).
- **Auth:** Amazon Cognito (maps to the Identity module; supports email/OTP login).
- **API:** Amazon API Gateway (HTTP API) fronting AWS Lambda.
- **Compute:** AWS Lambda (serverless, event-driven).
- **Event bus:** Amazon EventBridge — this IS the `Event_Bus` from the architecture. An in-process event bus is the mock/dev implementation.
- **Workflow / state machine:** AWS Step Functions provides the AWS-native orchestration of the `ReturnRequest` lifecycle when deployed. The in-process State-pattern implementation (per the Engineering Principles steering) is authoritative and is what runs in local/demo mode; Step Functions mirrors that same lifecycle.
- **AI grading:** Amazon Bedrock (a multimodal model — Anthropic Claude or Amazon Nova) behind `IConditionGrader` and `IIdentityVerifier`. The `MockConditionGrader` / `MockIdentityVerifier` are the deterministic local implementations (Requirement 16).
- **Data:** Amazon DynamoDB behind the repository interfaces. DynamoDB Local or in-memory repositories for dev/demo.
- **Media storage:** Amazon S3 for return photos/video, uploaded via presigned URLs. Local filesystem (or LocalStack) for dev/demo.
- **Notifications:** Amazon SNS (SMS/push) and SES (email) behind the notification-channel interface; a console/log adapter for dev/demo.
- **Infrastructure as Code:** AWS CDK (TypeScript). All AWS resources defined in code.
- **Observability:** Amazon CloudWatch for structured domain-event logging and metrics.

## Service-to-architecture mapping (keep these 1:1)

- `Event_Bus` → Amazon EventBridge
- `ReturnRequest` state machine (Requirement 14) → AWS Step Functions
- `IConditionGrader` / `IIdentityVerifier` → Amazon Bedrock adapter
- Repositories → Amazon DynamoDB
- Media storage → Amazon S3
- Identity module → Amazon Cognito
- Notifications module → Amazon SNS / SES
