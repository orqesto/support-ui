# Support Ticket System - Frontend

Modern React + TypeScript frontend for the AI-driven support ticket system with multi-channel ingestion.

## Tech Stack

- **React 18** with TypeScript
- **Vite** - Fast build tool
- **React Router** - Client-side routing
- **Axios** - HTTP client
- **TailwindCSS** - Utility-first CSS
- **Lucide React** - Icon library

## Features

- **Authentication**: Secure JWT-based login
- **Dashboard**: Overview of messages and tickets
- **Messages Management**: 
  - View incoming messages from email/Slack/Telegram
  - Approve messages to create tickets
  - Reject/mark as processed
- **Tickets Management**:
  - View all support tickets
  - Create tickets from messages
  - Update ticket status and priority
  - Push individual tickets to Jira
  - Bulk sync all unsynced tickets to Jira
- **Responsive Design**: Works on desktop and mobile

## Getting Started

### Prerequisites

- Node.js 18+
- Backend service running on port 3000

### Installation

```bash
npm install
```

### Environment Setup

Create a `.env` file (copy from `.env.example`):

```bash
VITE_API_URL=http://localhost:3000
```

### Development

Start the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
npm run preview
```

## Default Credentials

- **Email**: `ecttet@gmail.com`
- **Password**: `password123`

## Project Structure

```
src/
├── components/
│   ├── ui/           # Reusable UI components (Button, Input, Card, etc.)
│   └── layout/       # Layout components (Layout, Sidebar, etc.)
├── pages/            # Page components
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   ├── MessagesPage.tsx
│   ├── TicketsPage.tsx
│   └── CreateTicketPage.tsx
├── services/         # API service layers
│   ├── auth.service.ts
│   ├── ticket.service.ts
│   ├── message.service.ts
│   └── category.service.ts
├── contexts/         # React contexts
│   └── AuthContext.tsx
├── lib/              # Utilities and configurations
│   ├── api-client.ts
│   └── utils.ts
├── types/            # TypeScript type definitions
│   └── index.ts
└── App.tsx           # Main app component with routing
```

## API Integration

The frontend communicates with the backend via REST API:

- **Base URL**: Configured in `.env` (default: `http://localhost:3000`)
- **Authentication**: JWT token stored in localStorage
- **Auto-refresh**: Token automatically included in requests
- **Error Handling**: 401 errors redirect to login

## Key Workflows

### Message to Ticket Flow
1. User views unprocessed messages on Messages page
2. User clicks "Approve" on a message
3. System navigates to Create Ticket page with pre-filled data
4. User edits and submits ticket
5. Ticket created and message marked as processed

### Jira Integration Flow
1. User views tickets on Tickets page
2. For tickets without Jira link, user clicks "Push to Jira"
3. System creates Jira issue and updates ticket with Jira ID
4. Jira link displayed on ticket for future reference

## License

ISC
