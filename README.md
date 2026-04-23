# Pottery Tag Library

This project is now a phone-ready web app with two modes:

- Local mode: works immediately in one browser
- Cloud mode: uses Supabase so your tags and pottery photos sync across devices, including iPhone

## What it does now

- Uses a master tag list to prevent typo duplicates like `green` and `gren`
- Lets each pottery piece have multiple selected tags
- Supports include tags, exclude tags, `match all`, and `match any`
- Compresses photos before saving or uploading
- Can be installed to a phone home screen as a PWA
- Supports email link sign-in for private cloud sync

## Files to know

- [index.html](C:\Users\lukas\Documents\New project\index.html): app layout
- [app.js](C:\Users\lukas\Documents\New project\app.js): app logic, local mode, cloud sync, and PWA setup
- [styles.css](C:\Users\lukas\Documents\New project\styles.css): styling
- [config.js](C:\Users\lukas\Documents\New project\config.js): your local Supabase keys
- [config.example.js](C:\Users\lukas\Documents\New project\config.example.js): sample config
- [supabase.sql](C:\Users\lukas\Documents\New project\supabase.sql): database and storage setup
- [app.webmanifest](C:\Users\lukas\Documents\New project\app.webmanifest): installable app metadata
- [service-worker.js](C:\Users\lukas\Documents\New project\service-worker.js): offline cache

## How to access it personally

### Fastest personal path

1. Create a Supabase project.
2. In the Supabase SQL editor, run [supabase.sql](C:\Users\lukas\Documents\New project\supabase.sql).
3. Edit [config.js](C:\Users\lukas\Documents\New project\config.js) using [config.example.js](C:\Users\lukas\Documents\New project\config.example.js) as your template, then paste in your project URL and anon key.
4. Publish this folder as a static site.
5. Open the site on your iPhone.
6. Enter your email in the app and use the magic link to sign in.
7. In Safari, tap `Share` then `Add to Home Screen` to make it feel like an app.

### Good hosting choices

- Netlify
- Vercel
- Cloudflare Pages
- GitHub Pages

Any of those can host this project because it is a static web app.

## Publishing steps

### Option 1: Personal use only

Use a static hosting service and keep the URL private. This is the easiest route and does not require the Apple App Store.

### Option 2: Public-facing web app

Buy a domain, point it to your host, and share the web app link. Users will open it in Safari and can add it to their home screen.

### Option 3: App Store later

Once the workflow feels solid, wrap this PWA or rebuild it as a native iOS app with SwiftUI or React Native. That is the point where App Store publishing becomes worth the effort.

## Notes about Supabase setup

- Enable email auth in Supabase Authentication.
- Add your production URL to Supabase redirect URLs so magic-link sign-in returns to the app.
- The SQL script creates:
  - `tags`
  - `entries`
  - `entry_tags`
  - a `pottery-images` storage bucket
  - row-level security so each signed-in user only sees their own data

## Current limits

- Editing existing entries is not added yet.
- Search is client-side after data loads.
- There is no bulk import or export yet.
- The app is installable on iPhone, but it is not an App Store binary.

## Recommended next build steps

1. Add edit support for entries and tags.
2. Add tag categories like glaze, clay body, firing, and finish.
3. Add favorites and saved searches.
4. Add thumbnail loading and pagination once the library gets large.
5. Add export or backup features.
