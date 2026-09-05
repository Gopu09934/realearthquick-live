# Earthquake Globe → YouTube Live (via GitHub Actions)

Renders `earthquake-dashboard.html` in a real Chromium window on a virtual
display, then screen-captures it with ffmpeg and pushes it to YouTube over RTMP.

```
Chromium (plain process, --kiosk) ──renders──▶ Xvfb virtual screen ──x11grab──▶ ffmpeg ──RTMP──▶ YouTube
```

Chrome is launched as a **plain OS process**, not through Playwright's
`launch()`. Playwright drives Chrome over the DevTools remote-debugging
protocol, and that automation layer is what stops `--kiosk` from fully
hiding the address bar/tabs. Launching the same binary directly has no
such layer, so `--kiosk` behaves exactly like it does for a human — no
URL bar, no tabs, nothing but the page. The `playwright` npm package is
kept around only so `stream/print-chrome-path.js` can tell us exactly
where its bundled Chromium binary lives.

## 1. One-time setup

1. **Get a YouTube stream key**
   - youtube.com → Create → Go live → Stream (not "Webcam")
   - Copy the **Stream key** shown there.
   - Your channel needs live streaming enabled first (phone verification,
     ~24h wait if this is your first live stream).

2. **Add it as a GitHub secret**
   - Repo → Settings → Secrets and variables → Actions → New repository secret
   - Name: `YOUTUBE_STREAM_KEY`, value: the key from step 1.

3. **Push these files** to the repo (paths matter):
   ```
   earthquake-dashboard.html
   .github/workflows/youtube-stream.yml
   stream/package.json
   stream/print-chrome-path.js
   ```

4. **Start it**: Actions tab → "Stream Earthquake Globe to YouTube" → Run workflow.
   It'll also auto re-launch every 5 hours from then on (see the caveat below).

## 2. Why it restarts every ~5 hours

GitHub-hosted runners hard-cap any single job at **6 hours** — this isn't
configurable. The workflow schedules a fresh run every 5 hours and cancels
any run still going, so you get a continuously-live channel but with a
brief (~30–60s) reconnect blip each time the old job hands off to the new one.

If you want a truly gapless, unbroken stream, run the exact same pipeline
(Xvfb → Chrome `--kiosk` → `ffmpeg -f x11grab ...`) as a background service
on a small always-on box instead (a $4–6/mo VPS, a spare Raspberry Pi,
whatever) — GitHub Actions is fundamentally built for finite jobs, not
long-running daemons, so it's the wrong tool for a truly 24/7 stream even
though it works fine for a "live most of the time, brief blips" one.

## 3. Local test before burning Actions minutes

You can run the exact same pipeline on your own machine first:

```bash
# from the repo root
python3 -m http.server 8080 &
Xvfb :99 -screen 0 1920x1080x24 -ac &
export DISPLAY=:99

cd stream && npm install
CHROME_BIN=$(node print-chrome-path.js)
cd ..

"$CHROME_BIN" --kiosk --app="http://localhost:8080/earthquake-dashboard.html" \
  --window-size=1920,1080 --start-fullscreen --no-sandbox \
  --user-data-dir=/tmp/chrome-profile &

ffmpeg -f x11grab -video_size 1920x1080 -framerate 30 -i :99 \
  -f lavfi -i "sine=f=55:r=48000" \
  -f lavfi -i "sine=f=82.41:r=48000" \
  -f lavfi -i "anoisesrc=colour=pink:amplitude=0.02:sample_rate=48000" \
  -filter_complex "[1:a]volume=0.05,tremolo=f=0.08:d=0.3[a1]; [2:a]volume=0.035[a2]; [3:a]volume=0.015[a3]; [a1][a2][a3]amix=inputs=3:duration=longest:normalize=0[aout]" \
  -map 0:v -map "[aout]" \
  -c:v libx264 -preset fast -b:v 6000k -c:a aac -b:a 128k \
  -f flv "rtmp://a.rtmp.youtube.com/live2/YOUR_STREAM_KEY"
```

Note: the local test command above generates a quiet synthesized ambient
drone (two low sine tones + a touch of pink noise) instead of true silence,
matching what the GitHub Actions workflow streams — see the "Tuning"
section below for why.

If a window pops up with **no address bar, no tabs — just the globe**
(temporarily drop `--kiosk` if you're on a real desktop and want to
actually see the window, since kiosk mode fills the whole screen) and
YouTube Studio shows an incoming signal with a clean picture, you're good
to push to Actions.

## 4. Tuning

- The Chrome flags (resolution, which URL it opens) live directly in the
  `.github/workflows/youtube-stream.yml` "Start virtual display + browser"
  step — edit the `--window-size` and `--app=` values there.
- `.github/workflows/youtube-stream.yml` — bitrate/preset in the ffmpeg
  command, and the cron restart interval.
- The dashboard auto-rotates the globe after 5s of no interaction, so it
  looks alive with nobody at the (nonexistent) mouse.

## 5. Costs / limits to be aware of

- Public repos get free Actions minutes; private repos are billed per
  minute — a ~5.5h job every ~5h adds up fast on a private repo. Check
  GitHub's current pricing before leaving this running long-term.
- The dashboard fetches live data from USGS and Google Fonts/cdnjs at
  runtime — the runner needs normal internet access, which GitHub-hosted
  runners have by default.
