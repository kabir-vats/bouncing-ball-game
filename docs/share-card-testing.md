# Share Card Testing

Social previews use the public share pages:

- Challenge: `/c/:slug`
- Daily: `/d/YYYY-MM-DD`

Those pages emit Open Graph tags and immediately redirect players into the app. Both use the same static preview image:

- `/share/ball-knowledge-share.png`

## Local testing

Vite does not run the Vercel API rewrites, so `npm run dev` is not enough for testing unfurl pages.

Use Vercel's local runtime:

```sh
vercel dev
```

Then check:

```sh
curl -I http://localhost:3000/share/ball-knowledge-share.png
curl http://localhost:3000/d/2026-05-01
curl http://localhost:3000/c/YOUR_SLUG
```

The image response should be `Content-Type: image/png`. The share page HTML should include `/share/ball-knowledge-share.png` as `og:image`.

## Deployed testing

After deploy, verify the public image before posting to Discord:

```sh
curl -I https://YOUR_DOMAIN/share/ball-knowledge-share.png
curl https://YOUR_DOMAIN/d/2026-05-01
curl https://YOUR_DOMAIN/c/YOUR_SLUG
```

Expected for the image:

```text
HTTP/2 200
content-type: image/png
```

If Discord has already seen a broken link, it may cache the old preview. Test with a fresh slug/date URL or add a harmless query string to the shared page while debugging.
