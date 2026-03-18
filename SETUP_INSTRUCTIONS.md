# Setup Instructions

## Quick Start

1. **Install dependencies**
   ```bash
   cd enlite-frontend
   pnpm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Start development server**
   ```bash
   pnpm dev
   ```

## Google Identity Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google Identity API
4. Create OAuth 2.0 credentials
5. Add authorized JavaScript origins:
   - `http://localhost:5173` (Vite dev server)
6. Copy Client ID to `.env` as `VITE_GOOGLE_CLIENT_ID`

## Cerbos Setup

1. **Install Cerbos locally**
   ```bash
   docker run -d -p 3592:3592 ghcr.io/cerbos/cerbos:latest
   ```

2. **Create policy files** in `cerbos/policies/`:
   ```yaml
   # worker_policy.yaml
   apiVersion: api.cerbos.dev/v1
   resourcePolicy:
     resource: "worker"
     version: "default"
     rules:
       - actions: ['read']
         effect: EFFECT_ALLOW
         roles:
           - admin
           - manager
           - worker
       
       - actions: ['write', 'delete']
         effect: EFFECT_ALLOW
         roles:
           - admin
           - manager
       
       - actions: ['manage']
         effect: EFFECT_ALLOW
         roles:
           - admin
   ```

3. Update `.env` with Cerbos URL

## Project Structure

```
enlite-frontend/
├── ia/
│   └── agents.md              # AI validation agents
├── src/
│   ├── domain/                # Pure business logic
│   │   ├── entities/
│   │   ├── repositories/
│   │   ├── value-objects/
│   │   └── errors/
│   ├── application/           # Use cases
│   │   └── use-cases/
│   ├── infrastructure/        # External integrations
│   │   ├── config/
│   │   ├── http/
│   │   ├── storage/
│   │   ├── repositories/
│   │   └── di/
│   └── presentation/          # React UI
│       ├── components/
│       ├── hooks/
│       ├── pages/
│       └── contexts/
├── scripts/
│   ├── validate-lines.js      # Line count validator
│   └── validate-architecture.js # Architecture validator
└── package.json
```

## Validation Commands

```bash
# Validate file line counts
pnpm validate:lines

# Validate Clean Architecture
pnpm validate:architecture

# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Type checking
pnpm type-check
```

## Development Workflow

1. Create feature branch
2. Implement following Clean Architecture
3. Keep files under 100 lines
4. Write tests (min 80% coverage)
5. Run validations before commit
6. Submit PR

## Troubleshooting

**TypeScript errors after install:**
- Run `pnpm install` again
- Restart TypeScript server in IDE

**Module not found errors:**
- Check path aliases in `tsconfig.json`
- Verify imports use `@domain`, `@application`, etc.

**Cerbos connection failed:**
- Ensure Cerbos is running on port 3592
- Check `VITE_CERBOS_URL` in `.env`
