# cf-git

**Git Repository Manager for the Fediverse**

cf-git is a federated Git repository hosting platform built on Cloudflare Workers. It allows you to host Git repositories that federate through ActivityPub — push code, share commits, and collaborate across the fediverse.

Built with Next.js 16, Cloudflare Workers (D1, Queues, Email, Turnstile), and ActivityPub.

## Features

- **ActivityPub Federation** — Every repository creation and commit federates to your followers automatically
- **Repository Management** — Create, clone, and manage Git repositories
- **Clone External Repos** — Clone repositories from GitHub, GitLab, or any Git host
- **Migrate Repositories** — Migrate existing repositories to cf-git
- **Cron-based Sync** — External repositories are synced automatically every 6 hours
- **Authentication** — Register/Login with Turnstile captcha protection
- **Email Verification** — Verify your email using Cloudflare Email Service
- **Password Management** — Change password, forgot password/reset flow
- **Federated Search** — Search for accounts across the fediverse via WebFinger
- **Size Limits** — Repository size limits (configurable, default 100MB)
- **ActivityPub Compatible** — Works with Mastodon, Pleroma, and other fediverse software

## Tech Stack

- **Framework:** Next.js 16 (with OpenNext Cloudflare adapter)
- **Platform:** Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)
- **Queue:** Cloudflare Workers Queues (for ActivityPub delivery)
- **Email:** Cloudflare Email Service (send email binding)
- **Auth:** Turnstile captcha + PBKDF2 password hashing
- **Federation:** ActivityPub (HTTP Signatures, WebFinger, NodeInfo)
- **Frontend:** React 19, Tailwind CSS v4

## Quick Start

### Prerequisites

- Node.js 20+
- Cloudflare account with D1, Queues, and Email Service enabled

### Setup

```bash
git clone https://github.com/anomalyco/cf-git.git
cd cf-git
npm install
```

### Configure Environment

Create a `.env` file with your Cloudflare credentials:

```env
CLOUDFLARE_API_TOKEN=your_token
CLOUDFLARE_ACCOUNT_ID=your_account_id
```

### Database Setup

```bash
npx wrangler d1 create cf-git
# Update database_id in wrangler.toml with the created ID
npm run db:migrate
```

### Configure Queues

```bash
npx wrangler queues create cf-git-delivery
```

### Development

```bash
npm run dev
```

### Deploy

```bash
npm run deploy
```

### Environment Variables (in wrangler.toml)

| Variable | Description | Default |
|----------|-------------|---------|
| `INSTANCE_TITLE` | Instance name | cf-git |
| `INSTANCE_DESCRIPTION` | Instance description | Git repository manager for the fediverse |
| `INSTANCE_URL` | Instance URL | https://cf-git.com |
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key | - |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key | - |
| `EMAIL_FROM` | Email sender address | noreply@cf-git.com |
| `EMAIL_FROM_NAME` | Email sender name | cf-git |
| `MAX_REPO_SIZE_MB` | Maximum repository size in MB | 100 |
| `MAX_REPO_FILE_SIZE_MB` | Maximum individual file size in MB | 25 |

## ActivityPub Endpoints

| Endpoint | Description |
|----------|-------------|
| `/.well-known/webfinger` | WebFinger discovery |
| `/.well-known/nodeinfo` | NodeInfo discovery |
| `/nodeinfo/2.0` | NodeInfo 2.0 payload |
| `/users/{username}` | ActivityPub Actor |
| `/users/{username}/inbox` | User inbox |
| `/users/{username}/outbox` | User outbox |
| `/users/{username}/followers` | Followers collection |
| `/users/{username}/following` | Following collection |
| `/inbox` | Shared inbox |
| `/objects/{id}` | ActivityPub Object |

## API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new account |
| POST | `/api/auth/login` | Sign in |
| GET | `/api/auth/verify-email` | Verify email |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password |
| POST | `/api/auth/resend-verification` | Resend verification email |
| POST | `/api/auth/change-password` | Change password |
| GET | `/api/repos` | List repositories |
| POST | `/api/repos` | Create repository |
| GET | `/api/repos/{name}` | Get repository details |
| DELETE | `/api/repos/{name}` | Delete repository |
| GET | `/api/repos/search` | Search repositories |
| POST | `/api/repos/sync` | Sync external repository |
| POST | `/api/follow` | Follow a user |
| POST | `/api/unfollow` | Unfollow a user |
| GET | `/api/notifications` | List notifications |
| GET | `/api/notifications/count` | Unread notification count |
| GET | `/api/v1/accounts/search` | Search accounts |
| GET | `/api/v1/instance` | Instance information |

## License

MIT
