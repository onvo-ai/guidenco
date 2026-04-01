# Guidenco - AI Digital Asset Creator

An AI-powered digital asset creation platform for generating graphics, documents, and videos with HTML, Tailwind CSS, and LLM-driven workflows.

## Features

- **Agentic asset generation**: Create and iterate on documents, graphics, and other assets with AI-assisted workflows
- **Project-based workspace**: Organize work by project with persistent database-backed state
- **Interactive chat experience**: Use natural language to drive asset creation and revisions
- **HTML and Tailwind rendering**: Generate structured layouts and visual designs with modern styling
- **Version history**: Track revisions and restore previous states
- **Export support**: Download generated outputs for use outside the app
- **Authentication**: Sign up and sign in with Better Auth
- **Storage and billing integrations**: Includes MinIO-compatible object storage support and Stripe webhook forwarding in local development

## Tech Stack

- **Next.js 16** - React framework with App Router
- **AI SDK v6** - AI integration and streaming
- **OpenRouter** - Access to Gemini 3.1 Pro Preview and other LLMs
- **Gemini 3.1 Pro Preview** - Configured language model for agentic behavior
- **Tailwind CSS v4** - Styling
- **shadcn/ui** - UI components
- **LaunchUI** - Landing page components
- **Better Auth** - Authentication
- **Drizzle ORM** - Database ORM
- **PostgreSQL** - Database
- **MinIO / S3-compatible storage** - Asset storage
- **Stripe** - Billing and webhook support
- **TypeScript** - Type safety
- **Remotion** - Video generation

## Getting Started

### Prerequisites

- Node.js 20+ recommended
- Docker Desktop with Docker Compose support
- OpenRouter API key

### Installation

1. Clone the repository:

```bash
git clone <your-repo-url>
cd guidenco
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file for Docker Compose services:

```bash
touch .env
```

4. Add your Docker service variables to `.env`:

```env
POSTGRES_USER=guidenco
POSTGRES_PASSWORD=your_postgres_password
POSTGRES_DB=guidenco_db
POSTGRES_PORT=5432

MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
```

5. Create a `.env.local` file for the Next.js app:

```bash
touch .env.local
```

6. Add your application variables to `.env.local`:

```env
POSTGRES_URL=postgresql://guidenco:your_postgres_password@localhost:5432/guidenco_db

BETTER_AUTH_SECRET=your_auth_secret
BETTER_AUTH_URL=http://localhost:3000

OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=google/gemini-3.1-pro-preview
SVG_MODEL=google/gemini-3.1-pro-preview

NEXT_PUBLIC_APP_URL=http://localhost:3000

STRIPE_SECRET_KEY=your_stripe_secret_key

S3_ENDPOINT=http://localhost:9000
S3_BUCKET=guidenco

AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
```

Generate an auth secret with:

```bash
openssl rand -base64 32
```

Get your API keys from:

- [OpenRouter](https://openrouter.ai/keys)
- [Stripe](https://dashboard.stripe.com/apikeys)

7. Start local services with Docker Compose:

```bash
docker compose -f docker-compose.dev.yml up
```

This starts the local support services defined in `docker-compose.dev.yml`, including PostgreSQL, MinIO, and Stripe webhook forwarding. Docker Compose reads these values from `.env`.

8. Push the database schema:

```bash
npm run db:push
```

If you need to wipe the existing database contents and rerun all SQL migrations:

```bash
npm run db:reset
```

9. Start the Next.js development server:

```bash
npm run dev
```

### Choosing a Model

The app uses `OPENROUTER_MODEL` and `SVG_MODEL` from `.env.local`. In your current setup, both are configured as `google/gemini-3.1-pro-preview`.

If you want to switch models, update those environment variables to any model available on OpenRouter, such as:

- `openai/gpt-4o` - GPT-4o
- `anthropic/claude-3.5-sonnet` - Claude 3.5 Sonnet
- `meta-llama/llama-3.1-70b-instruct` - Llama 3.1 70B
- See all available models at [OpenRouter Models](https://openrouter.ai/models)

### Running the App

With Docker services running and `npm run dev` started, open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Sign Up/Sign In**: Create an account or sign in to get started
2. **Create a Project**: Click "New Project" in the header
3. **Chat with AI**: Type your request in the chat interface, for example:
   - "Create a 800x600 document with a blue gradient background"
   - "Design a social media banner for a tech startup"
   - "Make a poster with the text 'Summer Sale' using a fun font"
   - "Create a flag design with stars and stripes"
4. **View Results**: The document updates in real-time as the AI generates HTML
5. **Version History**: Browse through all versions using the version selector
6. **Download**: Export as PNG image or HTML file

## How It Works

The AI system has access to several tools:

1. **createDocument**: Creates a new document with specified dimensions
2. **writeHTML**: Writes Handlebars template with Tailwind CSS, FontAwesome icons, and Google Fonts
3. **getDocumentState**: Views the current HTML and rendered image of the document
4. **searchImage**: Searches for images on Unsplash to use in designs

The AI can take multiple turns to refine the document, viewing the current state and making adjustments as needed. Each modification creates a new version that's saved in the database.

## Project Structure

```
guidenco/
├── app/
│   ├── api/
│   │   ├── asset-chat/        # Asset chat endpoints
│   │   ├── asset-generations/ # Asset generation endpoints
│   │   ├── auth/              # Authentication endpoints
│   │   ├── billing/           # Billing and Stripe webhook endpoints
│   │   ├── chat/              # Chat endpoints
│   │   ├── documents/         # Document operations
│   │   ├── render/            # Rendering/export endpoints
│   │   ├── settings/          # User and app settings endpoints
│   │   ├── video-chat/        # Video chat workflows
│   │   └── videos/            # Video generation endpoints
│   ├── app/                   # Authenticated app routes
│   ├── auth/                  # Auth pages
│   ├── debug/                 # Debug routes
│   ├── layout.tsx             # Root layout
│   └── page.tsx               # Landing page
├── components/
│   ├── asset-viewer.tsx       # Asset preview experience
│   ├── chat-interface.tsx     # Chat UI component
│   ├── header.tsx             # Header and project navigation
│   ├── settings-modal.tsx     # Project and app settings UI
│   ├── sidebar.tsx            # App navigation sidebar
│   ├── video-viewer.tsx       # Video preview and playback
│   ├── sections/              # LaunchUI sections
│   └── ui/                    # shadcn/ui components
├── lib/
│   ├── db/                    # Database schema and services
│   ├── auth.ts                # Better Auth configuration
│   ├── billing.ts             # Stripe helpers
│   ├── image-processing.ts    # Image processing utilities
│   └── video-prompts.ts       # Video prompt helpers
├── docs/                      # Setup and migration documentation
├── drizzle/                   # SQL migrations and snapshots
└── public/                    # Static assets
```

## Development

### Local Infrastructure

Start local services:

```bash
docker compose -f docker-compose.dev.yml up
```

Run in detached mode if preferred:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Stop services:

```bash
docker compose -f docker-compose.dev.yml down
```

Reset the local database and rerun migrations:

```bash
npm run db:reset
```

This command drops and recreates the `public` schema in the database referenced by `POSTGRES_URL`, then runs `drizzle-kit migrate`.

### Building for Production

```bash
npm run build
npm start
```

### Linting

```bash
npm run lint
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
