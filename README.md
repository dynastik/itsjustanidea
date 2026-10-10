# itsjustanidea

An experimental driving and typing game built with Vite, Three.js, and Rapier.

## Run locally

Requires Node.js 22.

```sh
npm ci
npm run dev
```

Create and preview a production build with `npm run build` and `npm run preview`.

## Deploy to GitHub Pages

The `Deploy to GitHub Pages` workflow builds and publishes the site whenever a
commit is pushed to `main`. In the repository's **Settings → Pages**, set
**Build and deployment → Source** to **GitHub Actions**. The workflow can also
be started manually from the **Actions** tab. The generated `dist` directory
is uploaded by the workflow; it does not need to be committed.

The Vite build uses relative asset paths, so it works both at the repository's
GitHub Pages URL and on a custom domain.

## Story

The story the player types lives in `story/short.md` and `story/long.md`. After editing them run:

```sh
npm run story
```

This regenerates `src/game/storyText.js` (committed, so a plain `npm run dev` does not need it). In the city, press **1** for the
short story or **2** for the long one before driving onto the highway.
