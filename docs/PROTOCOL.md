# WeMo Protocol Documentation

This document describes the UPnP/SOAP protocol used by Belkin WeMo devices.

## Overview

WeMo devices use standard UPnP (Universal Plug and Play) protocols:

1. **SSDP** - Simple Service Discovery Protocol for finding devices
2. **SOAP** - Simple Object Access Protocol for device control
3. **HTTP** - All communication is over HTTP on the local network

## Device Discovery (SSDP)

### M-SEARCH Request

To find WeMo devices, send a multicast UDP packet:

**Destination:** `239.255.255.250:1900`

```http
M-SEARCH * HTTP/1.1
HOST: 239.255.255.250:1900
MAN: "ssdp:discover"
MX: 5
ST: urn:Belkin:device:*
```

**Headers:**
| Header | Value | Description |
|--------|-------|-------------|
| HOST | 239.255.255.250:1900 | SSDP multicast address |
| MAN | "ssdp:discover" | Required for M-SEARCH |
| MX | 5 | Max wait time in seconds |
| ST | urn:Belkin:device:* | Search target (all Belkin devices) |

### M-SEARCH Response

WeMo devices respond with:

```http
HTTP/1.1 200 OK
CACHE-CONTROL: max-age=86400
EXT:
LOCATION: http://192.168.1.50:49153/setup.xml
OPT: "http://schemas.upnp.org/upnp/1/0/"; ns=01
SERVER: Unspecified, UPnP/1.0, Unspecified
ST: urn:Belkin:device:socket:1
USN: uuid:Socket-1_0-XXXXX::urn:Belkin:device:socket:1
```

**Key fields:**
- `LOCATION` - URL to fetch device description
- `ST` - Device type
- `USN` - Unique device identifier

### Device Types

| ST Value | Device |
|----------|--------|
| urn:Belkin:device:socket:1 | WeMo Switch |
| urn:Belkin:device:insight:1 | WeMo Insight Switch |
| urn:Belkin:device:lightswitch:1 | WeMo Light Switch |
| urn:Belkin:device:dimmer:1 | WeMo Dimmer |

## Device Description

Fetch the `LOCATION` URL to get device details:

```http
GET /setup.xml HTTP/1.1
Host: 192.168.1.50:49153
```

Response (simplified):
```xml
<?xml version="1.0"?>
<root xmlns="urn:Belkin:device-1-0">
  <device>
    <deviceType>urn:Belkin:device:socket:1</deviceType>
    <friendlyName>Living Room Lamp</friendlyName>
    <manufacturer>Belkin International Inc.</manufacturer>
    <modelName>Socket</modelName>
    <modelNumber>1.0</modelNumber>
    <UDN>uuid:Socket-1_0-XXXXX</UDN>
    <serialNumber>XXXXX</serialNumber>
    <firmwareVersion>WeMo_WW_2.00.11452.PVT-OWRT-SNSV2</firmwareVersion>
    <serviceList>
      <service>
        <serviceType>urn:Belkin:service:basicevent:1</serviceType>
        <serviceId>urn:Belkin:serviceId:basicevent1</serviceId>
        <controlURL>/upnp/control/basicevent1</controlURL>
        <eventSubURL>/upnp/event/basicevent1</eventSubURL>
        <SCPDURL>/eventservice.xml</SCPDURL>
      </service>
    </serviceList>
  </device>
</root>
```

## SOAP Communication

All device control uses SOAP requests to the control URL.

### SOAP Request Format

```http
POST /upnp/control/basicevent1 HTTP/1.1
Host: 192.168.1.50:49153
Content-Type: text/xml; charset="utf-8"
Content-Length: [length]
SOAPACTION: "urn:Belkin:service:basicevent:1#GetBinaryState"

<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" 
            s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:GetBinaryState xmlns:u="urn:Belkin:service:basicevent:1">
    </u:GetBinaryState>
  </s:Body>
</s:Envelope>
```

**Headers:**
| Header | Value |
|--------|-------|
| Content-Type | text/xml; charset="utf-8" |
| SOAPACTION | "[serviceType]#[action]" |

### SOAP Response Format

```xml
<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" 
            s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:GetBinaryStateResponse xmlns:u="urn:Belkin:service:basicevent:1">
      <BinaryState>1</BinaryState>
    </u:GetBinaryStateResponse>
  </s:Body>
</s:Envelope>
```

## Basic Event Service

**Service Type:** `urn:Belkin:service:basicevent:1`
**Control URL:** `/upnp/control/basicevent1`

### GetBinaryState

Gets the current on/off state.

**Request:**
```xml
<u:GetBinaryState xmlns:u="urn:Belkin:service:basicevent:1">
</u:GetBinaryState>
```

**Response:**
```xml
<BinaryState>1</BinaryState>
```

**Values:**
| Value | Meaning |
|-------|---------|
| 0 | Off |
| 1 | On |
| 8 | Standby (Insight) |

### SetBinaryState

Sets the on/off state.

**Request (turn on):**
```xml
<u:SetBinaryState xmlns:u="urn:Belkin:service:basicevent:1">
  <BinaryState>1</BinaryState>
</u:SetBinaryState>
```

**Request (turn off):**
```xml
<u:SetBinaryState xmlns:u="urn:Belkin:service:basicevent:1">
  <BinaryState>0</BinaryState>
</u:SetBinaryState>
```

**Response:**
```xml
<BinaryState>1</BinaryState>
```

## Insight Service

**Service Type:** `urn:Belkin:service:insight:1`
**Control URL:** `/upnp/control/insight1`

### GetInsightParams

Gets power monitoring data (Insight devices only).

**Request:**
```xml
<u:GetInsightParams xmlns:u="urn:Belkin:service:insight:1">
</u:GetInsightParams>
```

**Response:**
```xml
<InsightParams>1|1705312200|3600|7200|86400|155|123|456|12345|8</InsightParams>
```

### InsightParams Format

The response is a pipe-delimited string:

```
state|lastChange|onFor|onToday|onTotal|avgPower|currentPower|todayEnergy|totalEnergy|threshold
```

| Position | Field | Type | Description |
|----------|-------|------|-------------|
| 0 | state | int | Current state (0/1/8) |
| 1 | lastChange | int | Unix timestamp of last change |
| 2 | onFor | int | Seconds on this session |
| 3 | onToday | int | Seconds on today |
| 4 | onTotal | int | Total seconds on |
| 5 | avgPower | int | Period avg power (milliwatts) |
| 6 | currentPower | int | Current power (milliwatts) |
| 7 | todayEnergy | int | Today's energy (milliwatt-hours) |
| 8 | totalEnergy | int | Total energy (milliwatt-hours) |
| 9 | threshold | int | Standby threshold (milliwatts) |

**Converting units:**
- Divide milliwatts by 1000 for watts
- Divide milliwatt-hours by 1000 for watt-hours

## Error Handling

### SOAP Fault

When an error occurs:

```xml
<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <s:Fault>
      <faultcode>s:Client</faultcode>
      <faultstring>UPnPError</faultstring>
      <detail>
        <UPnPError xmlns="urn:schemas-upnp-org:control-1-0">
          <errorCode>501</errorCode>
          <errorDescription>Action Failed</errorDescription>
        </UPnPError>
      </detail>
    </s:Fault>
  </s:Body>
</s:Envelope>
```

### Common Error Codes

| Code | Description |
|------|-------------|
| 401 | Invalid Action |
| 402 | Invalid Args |
| 501 | Action Failed |
| 713 | No Such Entry |

## Network Considerations

### Ports

- **1900** - SSDP multicast (UDP)
- **49153** - Default device HTTP port (varies)

### Timeouts

- Discovery: 3-5 seconds
- SOAP requests: 10 seconds
- Device may be unresponsive if busy

### Reliability

WeMo devices can be unreliable:
- May not respond to first request
- May return malformed XML
- May reset connection unexpectedly

**Best practices:**
- Implement retry logic (2-3 attempts)
- Use reasonable timeouts
- Handle partial/malformed responses
- Cache device state to reduce polling

## Implementation Notes

### XML Parsing

WeMo responses may have namespace prefixes:
- `s:Envelope` or `SOAP-ENV:Envelope`
- `u:GetBinaryStateResponse` or `m:GetBinaryStateResponse`

Use a parser that handles namespaces or strips prefixes.

### State Polling

Devices don't support subscriptions reliably. Poll state periodically:
- Every 5-10 seconds for active UI
- Less frequently for background monitoring

### Concurrent Requests

Devices handle one request at a time. Queue requests or use timeouts to avoid conflicts.

## References

- [UPnP Device Architecture](http://upnp.org/specs/arch/UPnP-arch-DeviceArchitecture-v1.1.pdf)
- [SOAP 1.1 Specification](https://www.w3.org/TR/2000/NOTE-SOAP-20000508/)
- [pywemo](https://github.com/pywemo/pywemo) - Python reference implementation
- [wemo-client](https://github.com/timonreinhard/wemo-client) - Node.js reference
