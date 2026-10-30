# Private Room: paid live stream

OBS → **Mux** (live video, signed playback) · **Stripe** (checkout) · **Render** (this server).

Viewers open the public link, pay with Stripe, and get an HttpOnly access cookie for `ACCESS_HOURS`.
The server then hands them a Mux playback token that expires with their pass. Without a valid pass, the
stream can't be played, even with the playback ID.

## Environment variables (Render → service → Environment)

| Key | Required | What |
|---|---|---|
| `SESSION_SECRET` | yes | Any long random string (use Render's **Generate**). Without it, passes reset when the server restarts. |
| `STRIPE_SECRET_KEY` | for real payments | Stripe → Developers → API keys (`sk_test_…` to test, `sk_live_…` to go live). Unset = mock checkout. |
| `MUX_PLAYBACK_ID` | for video | Playback ID of your Mux live stream (must use the **signed** policy). |
| `MUX_SIGNING_KEY_ID` | for video | Mux → Settings → Signing Keys → key ID. |
| `MUX_SIGNING_PRIVATE_KEY` | for video | The base64 private key Mux shows once when you create the signing key. |
| `STREAM_TITLE` | no | Default `Private Room`. |
| `HOST_NAME` | no | Shown as "with …". |
| `PRICE_CENTS` | no | Default `999` ($9.99). |
| `CURRENCY` | no | Default `usd`. |
| `ACCESS_HOURS` | no | Default `24`. |
| `AGE_GATE` | no | `false` to turn off the 18+ screen. |

## Mux setup
1. Sign up at mux.com → **Video → Live Streams → Create New Live Stream**, with `"playback_policy": ["signed"]`.
2. Copy the stream's **Stream Key** and **Playback ID** (the signed one).
3. **Settings → Signing Keys → Generate** → copy the key ID and private key.

## OBS
Settings → Stream → Service **Custom** → Server `rtmps://global-live.mux.com:443/app` → Stream Key = your Mux stream key.

## Local run
`node server.js` (Node 18+, no dependencies) → http://localhost:3000
