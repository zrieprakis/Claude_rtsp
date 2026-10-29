# RTSP Quad Viewer

A web page with four quadrants, each playing an RTSP camera, plus a `/config` page where you enter each camera's RTSP URI.

Browsers can't play RTSP directly, so `server.js` (plain Node, no npm packages) runs [go2rtc](https://github.com/AlexxIT/go2rtc) in the background. go2rtc relays each camera to the browser over WebRTC, falling back to MSE, HLS or MJPEG, usually without re-encoding.

## Setup (once)

```powershell
npm run setup      # downloads go2rtc.exe into .\bin
```

## Run

Double-click **`start-viewer.bat`**: it starts the server, waits until it is up, then opens Chrome. **`stop-viewer.bat`** stops the server and go2rtc.

Or from a terminal:

```powershell
npm start
```

- Viewer: http://localhost:8080/ (double-click a quadrant for fullscreen)
- Config: http://localhost:8080/config

From another device on the LAN, use `http://<this-pc-ip>:8080/`. The first time you run it, Windows may ask to allow `node.exe` and `go2rtc.exe` through the firewall. Allow both on private networks.

## Ports

| Port | Used by |
|------|---------|
| 8080 | Web UI and config API (`PORT` env var to change) |
| 1984 | go2rtc API / stream WebSocket (the browser connects to it directly) |
| 8555 | go2rtc WebRTC media (TCP + UDP) |

## Notes

- URIs are saved in `config.json`, and `go2rtc.yaml` is regenerated from it. Saving the config restarts go2rtc, and players reconnect on their own.
- Camera credentials in the URIs are visible to anyone who can open `/config` or reach port 1984. Keep this on a trusted network.
- If a camera sends H.265, WebRTC can't carry it in most browsers. The player falls back to MSE, which works in Chrome and Edge.
- go2rtc's own dashboard at http://localhost:1984/ is useful for troubleshooting a stream.
