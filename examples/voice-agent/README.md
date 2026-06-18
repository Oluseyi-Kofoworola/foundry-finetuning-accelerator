# Voice Agent — Real-Time Voice-to-Voice Assistant

An enterprise-grade, real-time voice-to-voice agent system. It ships as a
**white-label template** (default brand: **Acme Health**) that any team can fork
and customize for their own client. Built with OpenAI's GPT-4o Realtime API for
natural conversational experiences.

> **Customizing for a client?** Read [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md).
> Most branding is driven by a single config file plus environment variables — you
> rarely need to touch component code.

## 🏥 Overview

The bundled example is a healthcare member-services agent. The domain is a
**swappable example** — see the customization guide to retarget it. Out of the
box it demonstrates:

- **PBM Pharmacy Services** - Medication pricing, prescription transfers, refill requests
- **Health Plan Concierge** - Member benefits, provider networks, coverage questions
- **Provider-Facing Assistant** - Clinical staff support, patient context retrieval
- **General Call Center** - Routing, general inquiries, appointment support

## ✨ Features

### Dual Mode Experience
- 💬 **Chat Mode** - Text-based conversations with file upload support
- 🎤 **Voice Mode** - Real-time voice-to-voice with sub-second latency

### Voice Experience
- 🔊 **Natural conversation** - Powered by GPT-4o Realtime API
- 🎯 **Barge-in support** - Interrupt the agent naturally while speaking
- 📊 **Volume visualization** - Real-time audio level indicators
- 🔇 **Mute/Unmute** - Easy conversation control

### Example Tools (12 Registered)
- ✅ Member identity verification with MFA
- 💊 Prescription lookup
- 💰 Medication price calculation with tier-based copays
- 🏥 In-network provider search
- 🔄 Prescription transfer between pharmacies
- 📋 Refill requests with authorization checks
- 🩺 Patient context retrieval (provider mode)
- 📅 Appointment scheduling
- 📝 Comprehensive audit logging
- 🏥 Full medical records access

### Enterprise Ready
- 🔒 Compliance-aware design with audit trails
- 🎭 Multi-scenario support with guardrails
- ⚠️ Prohibited topic detection
- 📊 Session management and analytics
- 🎨 White-label branding via config + env vars

---

## 🛠️ Architecture

```
┌─────────────────┐     WebSocket      ┌─────────────────┐     WebSocket     ┌─────────────────┐
│                 │  ◄──────────────►  │                 │  ◄─────────────►  │                 │
│  React Frontend │    Audio/Text      │  Node.js Server │   GPT-4o Realtime │   OpenAI API    │
│   (Vite + TS)   │                    │  (Express + TS) │                   │                 │
└─────────────────┘                    └─────────────────┘                   └─────────────────┘
       │                                       │
       │                                       │
       ▼                                       ▼
┌─────────────────┐                    ┌─────────────────┐
│  WebAudio API   │                    │  Tool Registry  │
│  (PCM16 Audio)  │                    │  + Scenarios    │
└─────────────────┘                    └─────────────────┘
```

---

## 📁 Project Structure

```
voice-agent/
├── package.json                 # Root workspace config
├── README.md                    # This file
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── src/
│       ├── index.ts             # Express server entry point
│       ├── types/
│       │   └── index.ts         # TypeScript definitions
│       ├── utils/
│       │   ├── config.ts        # Zod-validated configuration
│       │   └── logger.ts        # Winston logging + audit
│       ├── tools/               # Tool definitions + registry
│       ├── scenarios/
│       │   └── engine.ts        # Built-in scenarios + brand resolution
│       ├── services/            # Session, chat, realtime, Foundry clients
│       └── middleware/          # WebSocket + upload handlers
│
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js       # Brand colors via CSS variables
│   ├── index.html
│   ├── Dockerfile
│   └── src/
│       ├── App.tsx
│       ├── brand.ts             # Brand text from VITE_BRAND_* env
│       ├── components/
│       ├── hooks/
│       ├── services/
│       └── styles/
│           └── globals.css      # :root --brand-* CSS variables
│
└── infra/
    ├── main.bicep               # Azure Bicep IaC
    ├── main.bicepparam
    ├── deploy.ps1               # PowerShell deploy script
    ├── deploy.sh                # Bash deploy script
    └── modules/                 # Container Apps, OpenAI, Insights, alerts, RBAC
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- npm 9+
- OpenAI API key (optional - app works in demo mode without it)
- Modern browser with WebAudio support (for voice features)

### Installation

```bash
# From the accelerator repo root
cd examples/voice-agent

# Install all dependencies (root, backend, frontend)
npm install
```

### Configuration (Optional)

Create a `.env` file in the `backend` directory for voice features:

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your OpenAI API key and brand:

```env
# OpenAI Configuration (for voice features)
OPENAI_API_KEY=sk-your-api-key-here

# Server Configuration
PORT=3001
NODE_ENV=development

# Demo Mode (enabled by default)
DEMO_MODE=true
USE_MOCK_TOOLS=true

# Branding (white-label)
BRAND_ORG_NAME=Acme Health
BRAND_SHORT_NAME=Acme
BRAND_ASSISTANT_NAME=Acme Virtual Assistant
```

> **Note:** The app works without an API key - it will run in demo mode with chat functionality. Voice features require a valid OpenAI API key with Realtime API access.

### Start Development Servers

```bash
# From the root directory - starts both backend and frontend
npm run dev
```

This runs:
- **Backend**: http://localhost:3001 (API + WebSocket)
- **Frontend**: http://localhost:5173 (Vite dev server)

### Alternative: Start Individually

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

---

## 🎮 Using the Application

### Chat Mode (Default)
- Type messages in the input box
- Upload files (images, PDFs, documents) by clicking 📎 or drag & drop
- Use quick action buttons for common tasks

### Voice Mode
1. Click the **Voice** toggle in the header
2. Accept the consent dialog
3. Click the microphone button to start
4. Speak naturally - the agent will respond
5. Use **Mute** to pause, **End Call** to stop

### Available Scenarios (Voice Mode)
1. **PBM Pharmacy Assistant** - Prescription and medication help
2. **Health Plan Concierge** - Insurance and benefits questions
3. **Provider Assistant** - Clinical staff support
4. **General Call Center** - General inquiries

---

## 📊 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check with system status |
| `/api` | GET | API information |
| `/api/scenarios` | GET | List available scenarios |
| `/api/scenarios/:id` | GET | Get scenario details |
| `/api/tools` | GET | List registered tools |
| `/api/stats` | GET | Session statistics |
| `/api/chat/sessions` | POST | Create chat session |
| `/api/chat/sessions/:id` | GET | Get chat session |
| `/api/chat/sessions/:id/messages` | GET | Get chat messages |
| `/api/chat/sessions/:id/messages` | POST | Send message (with file upload) |
| `/api/files` | POST | Upload files |
| `/api/files/:filename` | GET | Serve uploaded file |
| `/ws` | WebSocket | Real-time voice/text communication |

---

## 📞 Demo Data

All demo data is mock — **no real PHI**. Replace it with your own fixtures when
you customize the agent.

### Test Members

| Member ID | Name | DOB | ZIP | Plan |
|-----------|------|-----|-----|------|
| MEM-001 | Sarah Johnson | 01/15/1985 | 63101 | Gold |
| MEM-002 | Michael Chen | 03/22/1978 | 19103 | Platinum |
| MEM-003 | Emily Rodriguez | 07/08/1992 | 78701 | Silver |

### Sample Medications

| Drug | Brand | 30-day | 90-day |
|------|-------|--------|--------|
| Lisinopril | Zestril | $10 | $25 |
| Metformin | Glucophage | $10 | $25 |
| Atorvastatin | Lipitor | $15 | $40 |
| Amlodipine | Norvasc | $10 | $25 |
| Omeprazole | Prilosec | $20 | $50 |

### Sample Conversation (Voice Mode)

```
User: "I need to refill my Lisinopril prescription"
Agent: "I'd be happy to help you with that refill. First, I'll need to verify your identity..."
User: "My date of birth is January 15, 1985"
Agent: "Thank you. And can you confirm your ZIP code?"
User: "63101"
Agent: "Perfect, I've verified your account Sarah. I can see you have a prescription for
        Lisinopril 10mg. Would you like me to process that refill for you?"
```

---

## 🔧 Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3001` |
| `HOST` | Server host | `0.0.0.0` |
| `NODE_ENV` | Environment | `development` |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `OPENAI_REALTIME_MODEL` | Realtime model | `gpt-4o-realtime-preview-2024-12-17` |
| `DEMO_MODE` | Enable demo mode | `true` |
| `USE_MOCK_TOOLS` | Use mock tool responses | `true` |
| `SESSION_TIMEOUT_MS` | Session timeout | `1800000` (30 min) |
| `LOG_LEVEL` | Logging level | `info` |
| `CORS_ORIGINS` | Allowed origins | `http://localhost:5173,http://localhost:3000` |
| `BRAND_ORG_NAME` | Organization name | `Acme Health` |
| `BRAND_SHORT_NAME` | Short brand name | `Acme` |
| `BRAND_ASSISTANT_NAME` | Assistant display name | `Acme Virtual Assistant` |

See [backend/.env.example](backend/.env.example) for the full list, including the
`BRAND_*` branding block.

### Azure OpenAI (Alternative)

```env
USE_AZURE_OPENAI=true
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-azure-api-key
AZURE_OPENAI_DEPLOYMENT=gpt-4o-realtime
```

---

## ☁️ Azure Deployment

The application is designed to deploy to **Azure Container Apps**. Resource names
below use the `voiceagent` base name — set your own via the infra parameters.

### Azure Resources

| Resource | Example name |
|----------|--------------|
| Resource Group | `rg-voiceagent-dev` |
| Container Apps Environment | `cae-voiceagent-dev` |
| Backend Container App | `ca-voiceagent-backend-dev` |
| Frontend Container App | `ca-voiceagent-frontend-dev` |
| Container Registry | `acrvoiceagent*` |

### Deploy

```powershell
# Login to Azure
az login

# Build and push images
cd backend
az acr build --registry <your-registry> --image voiceagent-backend:latest .

cd ../frontend
az acr build --registry <your-registry> --image voiceagent-frontend:latest .

# Update container apps
az containerapp update --name ca-voiceagent-backend-dev --resource-group rg-voiceagent-dev
az containerapp update --name ca-voiceagent-frontend-dev --resource-group rg-voiceagent-dev
```

### Infrastructure as Code

Deploy using Bicep:

```powershell
cd infra
az deployment group create --resource-group rg-voiceagent-dev --template-file main.bicep --parameters main.bicepparam
```

---

## 🛑 Stop / Start

### Local Development

```powershell
# Stop all Node processes
Get-Process node | Stop-Process -Force

# Or press Ctrl+C in each terminal
```

### Azure Container Apps

```powershell
# Stop (scale to 0)
az containerapp update --name ca-voiceagent-backend-dev --resource-group rg-voiceagent-dev --min-replicas 0 --max-replicas 0

# Start (scale back up)
az containerapp update --name ca-voiceagent-backend-dev --resource-group rg-voiceagent-dev --min-replicas 0 --max-replicas 3
```

---

## 🧪 Build for Production

```bash
# Build both
npm run build

# Or individually
cd backend && npm run build
cd frontend && npm run build
```

---

## 🔒 Security Notes

### Demo Mode
- ✅ Uses consent acknowledgment
- ✅ Implements audit logging
- ✅ Has guardrails for prohibited topics
- ⚠️ Uses mock data only (no real PHI)

### Production Considerations
- Enable TLS 1.3 for all connections
- Encrypt sensitive data at rest
- Implement RBAC and MFA
- Configure immutable audit trails
- Review your regulatory/compliance obligations for the target domain

See the repository-level [SECURITY.md](../SECURITY.md) for how to report vulnerabilities.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [CONTRIBUTING.md](../CONTRIBUTING.md) for full guidelines.

---

## 📄 License

Released under the [MIT License](../LICENSE).

---

## 🆘 Support

For questions or issues, open an issue in your fork's repository or update the
contact details here for your team.
