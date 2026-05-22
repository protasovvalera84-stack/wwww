# NexaLink

**NexaLink** — self-hosted, end-to-end encrypted messenger with a WhatsApp-style hybrid model.

## How it works (hybrid / relay model)

```
Phone A  →  NexaLink Server  →  Phone B
                   ↓
         Messages deleted after delivery
         (server acts as relay, not storage)
```

- **Messages**: stored on server only until all recipients download them (max 1 day).
- **Media**: stored on server for 30 days, then auto-deleted.
- **Local copy**: every device keeps a full local copy in IndexedDB / Room DB / SQLite.
- **Server purpose**: relay + push notification trigger — never a long-term archive.

## Features

- End-to-end encrypted messaging (Matrix E2EE)
- Voice & video calls (TURN/STUN via Coturn)
- Groups, channels, stories, polls
- Native apps: Android (Kotlin), Linux (GTK4), Windows (C#)
- Progressive Web App (PWA) for all other platforms
- One-command Docker deployment

## Quick start (server)

```bash
git clone https://github.com/protasovvalera84-stack/wwww.git
cd wwww/server
sudo bash scripts/setup.sh
```

The setup script:
1. Installs Docker & Docker Compose (if missing)
2. Generates secure secrets
3. Obtains a TLS certificate (Let's Encrypt via nip.io)
4. Starts the full stack: NexaLink server, PostgreSQL, Redis, Coturn, Nginx, Admin panel, Monitoring

## Services

| Service        | URL                                        |
|----------------|--------------------------------------------|
| Web client     | `https://<your-ip>.nip.io`                 |
| Admin panel    | `https://<your-ip>.nip.io/admin`           |
| Config panel   | `https://<your-ip>.nip.io/config`          |
| Grafana        | `https://<your-ip>.nip.io/grafana/`        |
| Prometheus     | `https://<your-ip>.nip.io/prometheus/`     |

## Native app downloads (served automatically)

| Platform | Installer URL                                        |
|----------|-----------------------------------------------------|
| Android  | `/installers/native/NexaLink-Android.apk`           |
| Windows  | `/installers/native/NexaLink-Windows.exe`           |
| Linux    | `/installers/native/NexaLink-Linux`                 |

## Retention policy (WhatsApp-like)

| Type    | Server lifetime | Client storage |
|---------|----------------|----------------|
| Messages | 1 day          | Forever (local) |
| Media    | 30 days        | Forever (local) |
| Profiles | Permanent      | Cached          |

## Stack

- **Server**: Matrix (Synapse)
- **DB**: PostgreSQL 16
- **Cache**: Redis 7
- **Proxy**: Nginx
- **TURN**: Coturn
- **Frontend**: React + TypeScript + Vite
- **Android**: Kotlin + Room + OkHttp + WebRTC
- **Linux**: C + GTK4 + libsoup
- **Windows**: C# + WPF + .NET 8

## Security

- All traffic encrypted via TLS 1.2/1.3
- Matrix end-to-end encryption (Olm/Megolm)
- fail2ban + DDoS protection via iptables
- Firewall: UFW + Docker-USER chain rules
- Biometric auth on mobile

## License

MIT
