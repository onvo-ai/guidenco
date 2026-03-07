# Guidenco - AI Digital Asset Creator

An AI-powered digital asset creation tool that uses HTML, Tailwind CSS, and LLMs to generate graphics, illustrations, and visual content.

## Features

- **Agentic AI System**: Uses Gemini 2.5 Pro via OpenRouter with custom tools to create and manipulate HTML designs
- **Project Management**: Create and switch between multiple projects with database storage
- **Interactive Chat Interface**: ChatGPT-like interface for natural language asset creation
- **HTML & Tailwind CSS**: AI creates designs using HTML with Tailwind CSS and FontAwesome icons
- **Google Fonts Integration**: Access thousands of Google Fonts in your designs
- **Version History**: Track all versions of your designs and restore previous iterations
- **Export Functionality**: Download your creations as PNG images or HTML files
- **Real-time Preview**: See your assets being created in real-time

## Tech Stack

- **Next.js 15** - React framework with App Router
- **Vercel AI SDK v4** - AI integration and streaming
- **OpenRouter** - Access to Gemini 2.5 Pro and other LLMs
- **Gemini 2.5 Pro** - Language model for agentic behavior
- **Tailwind CSS v4** - Styling
- **LaunchUI** - Landing page components
- **shadcn/ui** - UI components
- **Better Auth** - Authentication
- **Drizzle ORM** - Database ORM
- **PostgreSQL** - Database
- **TypeScript** - Type safety

## Getting Started

### Prerequisites

- Node.js 18+ installed
- PostgreSQL database
- OpenRouter API key
- Unsplash API key (for image search)

### Installation

1. Clone the repository:

```bash
cd guidenco
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env.local` file in the root directory:

```bash
cp .env.local.example .env.local
```

4. Add your environment variables to `.env.local`:

```
DATABASE_URL=your_postgres_connection_string
BETTER_AUTH_SECRET=your_auth_secret
BETTER_AUTH_URL=http://localhost:3000
OPENROUTER_API_KEY=your_openrouter_api_key
UNSPLASH_ACCESS_KEY=your_unsplash_api_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Get your API keys from:

- [OpenRouter](https://openrouter.ai/keys)
- [Unsplash](https://unsplash.com/developers)

5. Set up the database:

```bash
npm run db:push
```

### Choosing a Model

The app is configured to use `google/gemini-2.5-pro` by default. You can change this in `/app/api/chat/route.ts` to use any model available on OpenRouter, such as:

- `openai/gpt-4o` - GPT-4o
- `anthropic/claude-3.5-sonnet` - Claude 3.5 Sonnet
- `meta-llama/llama-3.1-70b-instruct` - Llama 3.1 70B
- See all available models at [OpenRouter Models](https://openrouter.ai/models)

### Running the App

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

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
│   │   ├── auth/              # Authentication endpoints
│   │   ├── chat/              # AI chat endpoint with tools
│   │   ├── projects/          # Project CRUD operations
│   │   ├── document/           # Document CRUD operations
│   │   └── render/            # Server-side rendering for exports
│   ├── auth/                  # Auth pages
│   ├── app/                   # Main app routes (dashboard, projects)
│   ├── layout.tsx             # Root layout
│   └── page.tsx               # Landing page
├── components/
│   ├── html-viewer.tsx        # HTML preview and download
│   ├── chat-interface.tsx     # Chat UI component
│   ├── header.tsx             # Header with project selector
│   ├── sections/              # LaunchUI sections
│   └── ui/                    # shadcn/ui components
├── lib/
│   ├── db/                    # Database schema and client
│   ├── auth.ts                # Better Auth configuration
│   ├── types.ts               # TypeScript types
│   └── utils.ts               # Utility functions
└── public/                    # Static assets
```

## Development

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
