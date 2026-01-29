# REST API Documentation

The Open Wemo Bridge exposes a REST API for device management and control.

## Base URL

```
http://<bridge-ip>:51515/api
```

The bridge IP is typically your computer's local IP address (e.g., `192.168.1.100`).

## Response Format

All responses are JSON with a consistent structure:

**Success:**
```json
{
  "devices": [...],
  "device": {...}
}
```

**Error:**
```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

## Endpoints

### Devices

#### List All Devices

```http
GET /api/devices
GET /api/devices?includeState=true
```

Lists all saved devices. Optionally includes current state (slower, requires polling each device).

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| includeState | boolean | false | Poll current state for each device |

**Response:**
```json
{
  "devices": [
    {
      "id": "uuid:Socket-1_0-XXXXX",
      "name": "Living Room Lamp",
      "deviceType": "Switch",
      "host": "192.168.1.50",
      "port": 49153,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

With `includeState=true`:
```json
{
  "devices": [
    {
      "id": "uuid:Socket-1_0-XXXXX",
      "name": "Living Room Lamp",
      "deviceType": "Switch",
      "host": "192.168.1.50",
      "port": 49153,
      "isOnline": true,
      "state": 1,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

#### Get Device

```http
GET /api/devices/:id
```

Gets a single device by ID with current state.

**Response:**
```json
{
  "device": {
    "id": "uuid:Socket-1_0-XXXXX",
    "name": "Living Room Lamp",
    "deviceType": "Switch",
    "host": "192.168.1.50",
    "port": 49153,
    "isOnline": true,
    "state": 1,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Errors:**
- `404` - Device not found

---

#### Add Device

```http
POST /api/devices
```

Adds a new device or updates an existing one.

**Request Body:**
```json
{
  "name": "Living Room Lamp",
  "host": "192.168.1.50",
  "port": 49153,
  "deviceType": "Switch"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| name | string | Yes | - | Display name |
| host | string | Yes | - | Device IP address |
| port | number | No | 49153 | Device port |
| deviceType | string | No | "Switch" | Device type |
| id | string | No | auto | Device ID (auto-discovered if omitted) |

**Response:**
```json
{
  "device": { ... },
  "created": true
}
```

**Errors:**
- `400` - Missing required fields

---

#### Update Device

```http
PATCH /api/devices/:id
```

Updates device properties.

**Request Body:**
```json
{
  "name": "New Name",
  "host": "192.168.1.51",
  "port": 49154
}
```

All fields are optional. Only provided fields are updated.

**Response:**
```json
{
  "device": { ... }
}
```

**Errors:**
- `404` - Device not found

---

#### Delete Device

```http
DELETE /api/devices/:id
```

Removes a device from the database.

**Response:**
```json
{
  "deleted": true,
  "id": "uuid:Socket-1_0-XXXXX"
}
```

**Errors:**
- `404` - Device not found

---

### Device Control

#### Get Device State

```http
GET /api/devices/:id/state
```

Gets the current state of a device.

**Response:**
```json
{
  "id": "uuid:Socket-1_0-XXXXX",
  "state": 1,
  "isOn": true,
  "isStandby": false
}
```

**State Values:**
| Value | Meaning |
|-------|---------|
| 0 | Off |
| 1 | On |
| 8 | Standby (Insight only) |

**Errors:**
- `404` - Device not found
- `503` - Device offline

---

#### Turn Device On

```http
POST /api/devices/:id/on
```

Turns the device on.

**Response:**
```json
{
  "id": "uuid:Socket-1_0-XXXXX",
  "action": "on",
  "state": 1,
  "isOn": true
}
```

**Errors:**
- `404` - Device not found
- `503` - Device offline

---

#### Turn Device Off

```http
POST /api/devices/:id/off
```

Turns the device off.

**Response:**
```json
{
  "id": "uuid:Socket-1_0-XXXXX",
  "action": "off",
  "state": 0,
  "isOn": false
}
```

**Errors:**
- `404` - Device not found
- `503` - Device offline

---

#### Toggle Device

```http
POST /api/devices/:id/toggle
```

Toggles the device state (on→off or off→on).

**Response:**
```json
{
  "id": "uuid:Socket-1_0-XXXXX",
  "action": "toggle",
  "state": 0,
  "isOn": false
}
```

**Errors:**
- `404` - Device not found
- `503` - Device offline

---

### Insight Power Monitoring

#### Get Power Data

```http
GET /api/devices/:id/insight
```

Gets power monitoring data for Insight devices.

**Response:**
```json
{
  "id": "uuid:Insight-1_0-XXXXX",
  "power": {
    "isOn": true,
    "isStandby": false,
    "currentWatts": 12.3,
    "todayKwh": 0.456,
    "totalKwh": 12.345,
    "onForFormatted": "1h",
    "onTodayFormatted": "2h"
  },
  "raw": "1|1705312200|3600|7200|86400|155|12300|27360|740700|8000"
}
```

**Power Data Fields:**
| Field | Type | Description |
|-------|------|-------------|
| isOn | boolean | Whether device is on |
| isStandby | boolean | Whether device is in standby mode |
| currentWatts | number | Current power draw in watts |
| todayKwh | number | Energy used today in kWh |
| totalKwh | number | Total energy used in kWh |
| onForFormatted | string | Time on this session (e.g., "2h 30m") |
| onTodayFormatted | string | Time on today (e.g., "5h 15m") |

**Errors:**
- `404` - Device not found
- `400` - Device does not support Insight
- `503` - Device offline

---

### Discovery

#### Discover Devices

```http
GET /api/discover
GET /api/discover?timeout=5000
```

Scans the local network for WeMo devices using SSDP.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| timeout | number | 5 | Discovery timeout in seconds (max: 30) |

**Response:**
```json
{
  "devices": [
    {
      "id": "uuid:Socket-1_0-XXXXX",
      "name": "WeMo Switch",
      "deviceType": "Switch",
      "host": "192.168.1.50",
      "port": 49153,
      "manufacturer": "Belkin International Inc.",
      "model": "Socket",
      "serialNumber": "XXXXX",
      "firmwareVersion": "WeMo_WW_2.00.11452.PVT-OWRT-SNSV2"
    }
  ],
  "count": 1,
  "elapsed": 5023
}
```

---

## Error Codes

| HTTP Status | Code | Description |
|-------------|------|-------------|
| 400 | VALIDATION_ERROR | Missing or invalid request parameters |
| 400 | INSIGHT_NOT_SUPPORTED | Device does not support Insight features |
| 404 | DEVICE_NOT_FOUND | Device ID not found in database |
| 500 | INTERNAL_ERROR | Unexpected server error |
| 503 | DEVICE_OFFLINE | Device not reachable on network |

---

## Examples

### cURL

```bash
# List devices
curl http://192.168.1.100:51515/api/devices

# Turn on a device
curl -X POST http://192.168.1.100:51515/api/devices/uuid:Socket-1_0-XXXXX/on

# Discover devices
curl http://192.168.1.100:51515/api/discover?timeout=10000

# Add a device manually
curl -X POST http://192.168.1.100:51515/api/devices \
  -H "Content-Type: application/json" \
  -d '{"name": "Kitchen Light", "host": "192.168.1.51"}'
```

### JavaScript

```javascript
const API = 'http://192.168.1.100:51515/api';

// List devices with state
const { devices } = await fetch(`${API}/devices?includeState=true`)
  .then(r => r.json());

// Toggle a device
const result = await fetch(`${API}/devices/${deviceId}/toggle`, {
  method: 'POST'
}).then(r => r.json());

// Get power data
const { power } = await fetch(`${API}/devices/${deviceId}/insight`)
  .then(r => r.json());
```
