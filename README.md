<p align="center">
  <img src="docs/logo.png" width="120">
</p>

<p align="center">
  <h1 align="center">NO-Q</h1>
</p>

<p align="center">
  Multi-tenant SaaS helpdesk platform with AI-assisted ticket triage, customer workspaces, platform administration, and tenant-level customization.
</p>

<br>

<p align="center">
  <img src="docs/landing.png">
</p>

NO-Q transforms customer conversations into structured support tickets through AI-assisted workflows while giving organizations complete control over teams, branding, knowledge bases, analytics, and platform operations.

Built as a full-stack SaaS application with Flask, MongoDB, JWT authentication, and vanilla JavaScript.

<br>

## Architecture

Backend

- Flask
- MongoDB Atlas
- JWT Authentication
- Bcrypt Password Hashing
- Blueprint-Based Routing
- OpenAI/Groq Compatible AI Integration
- Multi-Tenant Data Isolation

Frontend

- HTML
- CSS
- Vanilla JavaScript
- Static Asset Delivery
- No Build Tools or Framework Dependencies

<br>

## Client Workspace

Organizations receive their own isolated workspace for managing support operations.

<p align="center">
  <img src="docs/dashboard.png">
</p>

The dashboard provides ticket summaries, priority breakdowns, and real-time activity across the organization.

<br>

<p align="center">
  <img src="docs/analytics.png">
</p>

Analytics track ticket volume, response times, resolution rates, category trends, and overall team performance.

<br>

<p align="center">
  <img src="docs/tickets.png">
</p>

Agents and supervisors collaborate through threaded ticket conversations with AI-assisted responses and structured workflows.

<br>

<p align="center">
  <img src="docs/team-chat.png">
</p>

Internal team communication allows supervisors and agents to coordinate without leaving the platform.

<br>

<p align="center">
  <img src="docs/team-members.png">
</p>

Supervisors can create and manage support agents within their company workspace.

<br>

<p align="center">
  <img src="docs/knowledge-base.png">
</p>

Each organization maintains a private knowledge base used for retrieval-augmented AI support assistance.

<br>

<p align="center">
  <img src="docs/branding.png">
</p>

Client workspaces support custom branding, colors, logos, and assistant configuration with live previews.

<br>

## Customer Experience

Customers interact through branded public support portals.

<p align="center">
  <img src="docs/customer-side.png">
</p>

The system supports AI-guided conversations, ticket creation, live replies, and self-service ticket tracking.

<br>

## Platform Administration

Platform administrators manage tenants, billing, approvals, and operational health across the entire system.

<p align="center">
  <img src="docs/admin-dash.png">
</p>

The administration dashboard provides visibility into platform activity and organization-wide metrics.

<br>

<p align="center">
  <img src="docs/admin-client-list.png">
</p>

Client organizations can be approved, managed, or removed from a centralized interface.

<br>

<p align="center">
  <img src="docs/admin-billing.png">
</p>

Subscription plans, invoices, payment rules, and revenue settings are handled at the platform level.

<br>

<p align="center">
  <img src="docs/system-health.png">
</p>

Operational health monitoring includes database connectivity, LLM providers, payment systems, and support activity.

<br>

<p align="center">
  <img src="docs/system-logs.png">
</p>

System configuration changes and administrative actions are tracked through a complete audit trail.

<br>

## Authentication

<p align="center">
  <img src="docs/login.png">
</p>

JWT-based authentication with role-based access control supports platform administrators, supervisors, and support agents.

<br>

## Core Features

- Multi-tenant SaaS architecture
- AI-assisted ticket triage
- Retrieval-augmented knowledge base
- Customer self-service portals
- Team chat and collaboration
- Supervisor and agent management
- Analytics and reporting
- Organization branding customization
- Platform billing administration
- Operational monitoring and audit logs
- JWT authentication and role-based permissions

<br>

## Technology Stack

Backend

- Python
- Flask
- MongoDB
- PyMongo
- JWT
- Bcrypt

Frontend

- HTML
- CSS
- JavaScript

Infrastructure

- MongoDB Atlas
- Groq
- OpenAI Compatible APIs