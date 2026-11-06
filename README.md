# Peggy’s 75th

A small invite and RSVP site for Peggy Jones’s 75th birthday dinner.
Saturday, December 19, 2026, 2 to 4 PM, Schobels’ Restaurant, Columbus, TX.

- **`index.html`** is the invite. Each guest gets their own link (`?g=…`), so the page greets them by name, they reply yes or no with a party size and a note, and they can come back to change it. The plain link with no `?g=` works too; those guests type their name.
- **`host.html`** is for you and your dad. A passphrase opens it. It shows totals, who has opened their link, who replied, and their notes. Add guests there, then copy each link or tap Text or Email to send it from your own phone.
- **The guest list lives in a Google Sheet** you own, through a small Apps Script web app (`apps-script/Code.gs`). Free, no new accounts. Either of you can open the sheet directly; rows typed into it show up on the host page.

With `apiUrl` empty in `config.js` the site runs in preview mode: everything works, but replies stay in the browser you’re using. The host passphrase in preview is `preview`.

## Make it live

1. **Make the sheet.** In Google Sheets, create a blank sheet named something like “Peggy 75 guests”.
2. **Add the script.** In that sheet, open Extensions > Apps Script. Replace what’s there with the contents of `apps-script/Code.gs` and save.
3. **Run setup once.** Pick `setup` in the function menu and press Run. Google asks you to authorize the script to edit this sheet. A “Guests” tab with headers appears.
4. **Set the passphrase.** In Apps Script, open Project Settings (the gear) > Script Properties > Add script property. Name it `HOST_PASSPHRASE` and give it a phrase you’ll share with your dad. It never goes in this repo.
5. **Deploy.** Deploy > New deployment > type Web app. Execute as: Me. Who has access: Anyone. Deploy, then copy the web app URL (it ends in `/exec`).
6. **Point the site at it.** Paste that URL into `apiUrl` in `config.js`. Set `rsvpBy` if you want a reply-by date. Commit.
7. **Turn on Pages.** In this repo, Settings > Pages > Build and deployment > Deploy from a branch > `main`, folder `/ (root)`. The site appears at `https://jonesco.github.io/peggy75/` and the host page at `https://jonesco.github.io/peggy75/host.html`.
8. **Share the sheet with your dad** (optional) if he wants to see the raw list too.

If you change `Code.gs` later, use Deploy > Manage deployments > edit > New version, so the same URL keeps working.

## Good to know

- Opening a guest’s link counts as “Opened”. The host page’s View button adds `peek=1`, so checking a link yourself doesn’t count.
- Guests only ever see their own name, seats and reply. Contact details and the list need the passphrase.
- The repo is public, so keep guest names and numbers in the sheet, not in files here.
- Tests: `npm test` runs `Code.gs` against a fake sheet and checks the preview store.
