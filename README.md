# Enlite Frontend

React frontend with RBAC using Cerbos and Google Identity, following Clean Architecture and SOLID principles.

## Architecture

This project follows **Clean Architecture** with strict layer separation:

- **Domain**: Pure business logic, entities, and interfaces (no external dependencies)
- **Application**: Use cases implementing business rules
- **Infrastructure**: External integrations (Cerbos, HTTP, Storage)
- **Presentation**: React components, hooks, and UI

## Tech Stack

- **React 18** with TypeScript
- **Vite** for build tooling
- **pnpm** as package manager (enforced)
- **Cerbos** for RBAC authorization
- **Google Identity** for authentication
- **Vitest** for testing
- **React Router** for navigation

## Prerequisites

- Node.js >= 18
- pnpm >= 8

## Installation

```bash
# Install dependencies (only pnpm is allowed)
pnpm install
```

## Environment Setup

Copy `.env.example` to `.env` and configure:

```env
VITE_GOOGLE_CLIENT_ID=your-google-client-id
VITE_CERBOS_URL=http://localhost:3592
VITE_API_BASE_URL=http://localhost:3000
```

## Development

```bash
# Start dev server
pnpm dev

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Type checking
pnpm type-check

# Lint
pnpm lint
```

## Validation

```bash
# Validate file line counts (max 100 lines)
pnpm validate:lines

# Validate Clean Architecture
pnpm validate:architecture
```

## Project Rules

### Code Quality
- Maximum 100 lines per file (enforced by ESLint)
- Maximum 20 lines per function
- No `any` types (strict TypeScript)
- Clean Code and SOLID principles

### Architecture
- Domain layer must not depend on other layers
- Application layer can only depend on Domain
- Infrastructure implements Domain interfaces
- Presentation uses Application use cases

### Testing
- Minimum 80% coverage for Domain and Application layers
- Unit tests for all use cases
- Component tests for React components
- E2E tests for critical user flows

## AI Agents

See `ia/agents.md` for automated validation agents:
- Test Guardian Agent
- Architecture Enforcer Agent
- Line Count Validator Agent
- Code Quality Agent
- Security & Compliance Agent
