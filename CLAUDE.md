# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A four-quadrant RTSP camera viewer for a home LAN (Windows host, no auth). Browsers can't play RTSP, so a plain Node server supervises a **go2rtc** child process that relays each camera to the browser over WebRTC (falling back to MSE, HLS or MJPEG).

## Commands

```powershell
npm run setup        # downloads go2rtc_win64.zip (latest GitHub release) into .\bin
npm start            # node server.js on :8080 (PORT env var overrides)
start-viewer.bat     # starts server in a minimized "RTSP Viewer Server" window, waits for :8080 to listen, opens Chrome
stop-viewer.bat      # kills whatever listens on :8080, go2rtc.exe from this folder's bin\, and that window
```

There is no build step, linter or test suite, and there are no npm dependencies (Node built-ins only; keep it that way). To check changes, run the server and use `GET/POST /api/config`, the viewer at `/` and the config page at `/config`. go2rtc's own dashboard at http://localhost:1984/ shows the state of each stream.

To test without a real camera, run a second go2rtc as a fake RTSP source on other ports, e.g. a yaml with `api.listen ":11984"`, `rtsp.listen ":18554"` and `streams: test: "ffmpeg:virtual?video=testsrc&size=720#video=h264"`. Then configure `rtsp://127.0.0.1:18554/test`. This needs ffmpeg on PATH, which is installed via winget.

## Architecture

The data flow spans three pieces:

1. **`server.js`** owns all state. `config.json` (`{cams: [4 strings]}`, gitignored) is the source of truth. On every `POST /api/config` it validates each entry (empty, or a single-line `rtsp://`/`rtsps://` URI), writes `config.json`, regenerates `go2rtc.yaml` (also gitignored, never edit it by hand), and **restarts go2rtc** (kill → wait for exit → respawn). go2rtc also restarts itself on crash with exponential backoff. Streams are named `cam1`…`cam4` by slot index, and empty slots are omitted from the yaml.
2. **go2rtc** (`bin/go2rtc.exe`) listens on `:1984` (API + WebSocket, `origin: "*"`) and `:8555` (WebRTC). Its own RTSP server is disabled (`rtsp.listen: ""`) so it doesn't take :8554.
3. **Browser pages** (`public/`): `index.html` loads go2rtc's `<video-stream>` web component via `/vendor/video-stream.js`. `server.js` proxies `/vendor/video-stream.js` and `/vendor/video-rtc.js` from go2rtc so the module import is same-origin. Each player, though, connects **directly** to `ws://<page-hostname>:1984/api/ws?src=camN`, not through Node. Players reconnect on their own after a go2rtc restart.

Implications:
- Changing a port means updating `server.js` constants, the hardcoded `1984` in `public/index.html`, and the `:8080` default in both `.bat` files.
- URIs are written into YAML as JSON-quoted strings (`JSON.stringify`), which are valid YAML double-quoted scalars. Keep that when touching yaml generation.
- `config.json` holds live camera credentials. Don't print or commit its contents.

## Windows gotchas

- `.bat` files must keep **CRLF** line endings. Git Bash `sed -i` and the Edit tool can silently convert them to LF, so re-check with `file *.bat`.
- Don't name batch files `start.bat`/`stop.bat`: typing `start` in cmd runs the built-in START (it opens a blank console).
- In `.bat` files, use `ping -n N 127.0.0.1 >nul` for delays. `timeout` fails when there's no interactive console.
- `stop-viewer.bat` deliberately kills by port and by go2rtc path, never every `node.exe` (other apps such as Stream Deck run Node).
- This folder is its own git repo (branch `master`, no remote). It's nested inside a repo that covers the user's whole home directory (`%USERPROFILE%`), so run git commands from this folder.
