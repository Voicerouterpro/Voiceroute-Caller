# Voiceroute — IVR System v1.0

Multi-profile PIN-based inbound IVR powered by SignalWire.

## Call Flow
1. Caller dials → hears Welcome Message
2. Presses 1 → asked for Account Number
3. Enters Account Number + # → asked for PIN
4. Enters PIN + # → all personalized messages play in order

## Quick Start
```bash
npm install
cp .env.example .env   # fill in credentials
npm start
```

## Default Login
- **Username:** superadmin  
- **Password:** Medusa@2024!  
(set via SUPER_ADMIN_USERNAME / SUPER_ADMIN_PASSWORD in .env)

## SignalWire Webhook
Set your phone number's call handler to:
`POST https://your-url/ivr/welcome`

## Project Structure
```
Voiceroute
├── server.js
├── .env.example
├── config/
│   ├── store.js     ← Data layer (JSON files)
│   └── auth.js      ← JWT auth
├── routes/
│   ├── ivr.js       ← SignalWire webhooks
│   └── api.js       ← Admin REST API
├── public/
│   └── index.html   ← Full admin dashboard
└── data/            ← Auto-created JSON storage
```
