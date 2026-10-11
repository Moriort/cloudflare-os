# Oretron OS - Setup Guide

## Prerequisites

1. **Node.js 22+** (required for TypeScript 7.0.2)
   ```bash
   # Install fnm (fast node manager)
   curl -fsSL https://fnm.vercel.app/install | bash
   source ~/.bashrc
   
   # Install and use Node.js 22
   fnm install 22
   fnm use 22
   ```

2. **pnpm** (package manager)
   ```bash
   npm install -g pnpm
   ```

3. **Cloudflare Account** (for Workers deployment)

4. **Supabase Account** (for OAuth integration)

## Quick Start

### 1. Clone and Install

```bash
cd /home/moriort/Development/cloudflare-os
pnpm install
```

### 2. Configure Environment

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .dev.vars
```

Edit `.dev.vars` with your values:

```ini
# Supabase OAuth (create at https://supabase.com/dashboard/org/_/apps)
SUPABASE_CLIENT_ID=your-client-id
SUPABASE_CLIENT_SECRET=your-client-secret

# Public URL for OAuth callbacks
PUBLIC_BASE_URL=http://localhost:8787

# Admin usernames
ADMINS=["admin"]
```

### 3. Run Locally

```bash
pnpm run-local
```

This will:
- Install dependencies
- Build required packages
- Start the local server at http://localhost:8787

### 4. Development Mode

For development with hot reload:

```bash
# Terminal 1: Backend
pnpm dev-server

# Terminal 2: Frontend
pnpm dev-client
```

Then visit http://localhost:3000

## Supabase OAuth Setup

1. Go to your Supabase organization settings: https://supabase.com/dashboard/org/_/apps
2. Click "Add application"
3. Set the Redirect URI to:
   - Local: `http://localhost:8787/gatekeeper/supabase/oauth`
   - Production: `https://os.oretron.cl/gatekeeper/supabase/oauth`
4. Copy the Client ID and Client Secret
5. Add them to your `.dev.vars` file

## Deployment to Cloudflare

### 1. Login to Cloudflare

```bash
pnpm exec wrangler login
```

### 2. Configure Production Secrets

```bash
pnpm exec wrangler secret put SUPABASE_CLIENT_ID
pnpm exec wrangler secret put SUPABASE_CLIENT_SECRET
```

### 3. Deploy

```bash
pnpm deploy
```

## Customization

### Branding

The Oretron branding is already applied:
- **Primary Color**: `#3B82F6` (Oretron Blue)
- **Secondary Color**: `#6366F1` (Cyber Indigo)
- **Favicon**: Custom Oretron "O" logo

To modify colors, edit:
- `packages/workshop-frontend/src/styles.css` (CSS variables)
- `packages/workshop-frontend/src/theme.ts` (runtime theme)

### Adding Gatekeepers

Each gatekeeper is a separate Cloudflare Worker. To add a new one:

1. Create a new package: `packages/gatekeeper-your-service/`
2. Add `wrangler.jsonc` configuration
3. Implement the gatekeeper interface
4. The dev server will auto-discover it

## Architecture

```
cloudflare-os/
├── packages/
│   ├── workshop-backend/      # Kernel (Durable Objects)
│   ├── workshop-frontend/     # React SPA
│   ├── workshop-shared/       # Shared API types
│   ├── gatekeeper-supabase/   # Supabase integration
│   ├── gatekeeper-github/     # GitHub integration
│   └── ...                    # Other gatekeepers
├── scripts/                   # Build and dev scripts
└── wrangler.jsonc             # Root Worker config
```

## Troubleshooting

### Build Errors

If you see TypeScript errors, ensure you're using Node.js 22+:

```bash
fnm use 22
node --version  # Should be v22.x.x
```

### Port Conflicts

If port 8787 is in use:

```bash
pnpm run-local --port 9000
```

### Workerd Issues

If workerd fails to start, try cleaning the cache:

```bash
rm -rf .wrangler
pnpm run-local
```

## Resources

- [Cloudflare OS Documentation](https://github.com/cloudflare/cloudflare-os)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Supabase Management API](https://supabase.com/docs/reference/api/introduction)
- [Cap'n Web RPC](https://github.com/cloudflare/capnweb)
