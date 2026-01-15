# Architecture Overview

This document describes the technical architecture of Open Wemo.

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER'S COMPUTER                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Open Wemo Bridge                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │ System Tray │  │ HTTP Server │  │ WeMo Protocol   │   │  │
│  │  │ (systray2)  │  │ (Hono)      │  │ Library         │   │  │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘   │  │
│  │         │                │                   │            │  │
│  │         └────────────────┼───────────────────┘            │  │
│  │                          │                                │  │
│  │                   ┌──────┴──────┐                         │  │
│  │                   │   SQLite    │                         │  │
│  │                   │  Database   │                         │  │
│  │                   └─────────────┘                         │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP (REST API)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        USER'S PHONE                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     Open Wemo PWA                          │  │
│  │  - Vanilla HTML/CSS/JS                                    │  │
│  │  - Service Worker for offline support                     │  │
│  │  - Installable via "Add to Home Screen"                   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Local Network
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        WEMO DEVICES                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Switch 1 │  │ Switch 2 │  │ Insight  │  │  Dimmer  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

## Why a Bridge?

**The Problem**: Web browsers cannot directly communicate with WeMo devices due to:
1. **CORS restrictions** - Browsers block cross-origin requests to local network devices
2. **HTTPS requirements** - PWAs require HTTPS, but WeMo devices only speak HTTP
3. **UPnP/SSDP** - Device discovery uses UDP multicast, unavailable from browsers

**The Solution**: A lightweight bridge application runs on the user's computer:
- Serves the PWA over HTTP (local network only)
- Provides a REST API that proxies to WeMo devices
- Handles device discovery via SSDP
- Persists device data in SQLite

## Package Structure

### `packages/bridge/` - Desktop Application

The bridge is a single compiled executable that:
- Runs silently in the system tray
- Serves the REST API and PWA
- Communicates with WeMo devices

```
bridge/
├── src/
│   ├── main.ts              # Application entry point
│   ├── server/              # HTTP server (Hono)
│   │   ├── index.ts         # Server setup and routes
│   │   ├── static.ts        # Static file serving
│   │   ├── errors.ts        # Error handling
│   │   └── routes/
│   │       ├── devices.ts   # Device CRUD + control
│   │       └── discovery.ts # Network scanning
│   │
│   ├── wemo/                # WeMo protocol implementation
│   │   ├── types.ts         # Type definitions
│   │   ├── soap.ts          # SOAP client
│   │   ├── discovery.ts     # SSDP device discovery
│   │   ├── device.ts        # Basic device operations
│   │   └── insight.ts       # Insight power monitoring
│   │
│   ├── tray/                # System tray UI
│   │   ├── index.ts         # Tray setup
│   │   ├── menu.ts          # Context menu
│   │   ├── qr-window.ts     # QR code display
│   │   ├── autostart.ts     # Auto-start on login
│   │   └── welcome.ts       # First-launch experience
│   │
│   └── db/                  # Data persistence
│       └── index.ts         # SQLite database wrapper
│
└── assets/                  # Icons and resources
```

### `packages/web/` - PWA Frontend

A lightweight PWA with no build step:

```
web/
├── index.html          # Single-page app
├── manifest.json       # PWA manifest
├── sw.js               # Service worker
├── css/
│   └── style.css       # All styles
├── js/
│   └── app.js          # All JavaScript
└── icons/              # App icons
```

## Technology Choices

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | Bun | Fast, modern, single-file compilation |
| Language | TypeScript | Type safety, better DX |
| HTTP Server | Hono | Lightweight, fast, good DX |
| Database | SQLite (bun:sqlite) | Zero-config, file-based |
| System Tray | systray2 | Cross-platform, lightweight |
| Frontend | Vanilla JS | No build step, fast, simple |
| PWA | Service Worker | Installable, offline support |

## Data Flow

### Device Discovery

```
1. User clicks "Discover Devices"
2. PWA → POST /api/discover → Bridge
3. Bridge sends SSDP M-SEARCH multicast (239.255.255.250:1900)
4. WeMo devices respond with their location URLs
5. Bridge fetches device info from each location
6. Bridge returns discovered devices to PWA
7. User selects devices to save
8. Bridge stores devices in SQLite
```

### Device Control

```
1. User taps device toggle
2. PWA → POST /api/devices/:id/toggle → Bridge
3. Bridge looks up device in SQLite
4. Bridge sends SOAP request to device:
   - POST /upnp/control/basicevent1
   - Action: SetBinaryState
5. Device responds with new state
6. Bridge returns result to PWA
7. PWA updates UI
```

### Offline Support

```
1. PWA caches last known device states
2. If Bridge unreachable:
   - Show "Bridge Offline" banner
   - Display cached states (grayed out)
   - Auto-retry connection every 10 seconds
3. When Bridge reconnects:
   - Refresh device states
   - Clear offline banner
```

## Security Considerations

### Local Network Only

- Bridge binds to local IP, not 0.0.0.0
- No cloud connectivity required
- No external API exposure

### No Authentication (by design)

- Only accessible on local network
- Same security model as WeMo devices themselves
- Adding auth would complicate PWA installation

### HTTPS Not Used

- PWA served over HTTP (required for local network)
- Service worker still works for caching
- No sensitive data transmitted

## Startup Sequence

```
1. Check for single instance (port conflict detection)
2. Initialize SQLite database
3. Start HTTP server (bind to local IP)
4. Create system tray icon
5. Run background device discovery
6. Show welcome window (if first launch)
7. Ready for connections
```

## Shutdown Sequence

```
1. Stop HTTP server gracefully (drain connections)
2. Destroy system tray
3. Close database connection
4. Exit process
```

## Error Handling Strategy

### Bridge Errors

- Uncaught exceptions logged, not crashed
- HTTP errors return structured JSON responses
- Device offline errors handled gracefully

### PWA Errors

- Network errors show offline banner
- Device errors show inline error messages
- Auto-retry for transient failures

## Build Process

Single-file executables compiled with `bun build --compile`:

```
1. Bundle TypeScript → JavaScript
2. Embed PWA files as static assets
3. Compile to platform-specific executable
4. Generate SHA256 checksums
```

Output:
- `dist/open-wemo-win.exe` (Windows x64)
- `dist/open-wemo-mac` (macOS ARM64)
- `dist/open-wemo-mac-intel` (macOS x64)
- `dist/open-wemo-linux` (Linux x64)
