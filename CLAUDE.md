# SIP House Planner

A browser-based floor plan tool for concept planning SIP houses, tiny houses, and small homes. It is plain HTML, CSS, and JavaScript with no build step and no dependencies. Keep it that way. It is hosted on GitHub Pages, and a Unity game version is planned later.

## Files

- `index.html`, `styles.css`, `app.js`: the whole app. `app.js` is one file.
- `templates/`: the default layout (`default-layout.json`) and the Extreme Panels starter plans. Each is a normal exported layout.
- `README.md`: user-facing docs. `TEST-CHECKLIST.md`: the manual test pass.

## Running and testing it

- Serve it over http. It cannot read its layout files from `file://`. Use `python3 -m http.server 8000 --bind 127.0.0.1`.
- There is no test runner. When you change behavior, drive the real app in a browser (Playwright is installed in the cloud environment) and check the result, not just the syntax.
- When you add or change a feature, update `README.md` and `TEST-CHECKLIST.md` in the same change.

## Code conventions

- Layouts are stored in feet. Metric only changes what is shown and how typed values are read.
- Snapping uses one function, `snap`, for the footprint, rooms, doorways, windows, and items: 3 inches (5 cm in metric). Do not add another snapping function. Wall thickness is a different quantity and rounds to 1/4 inch separately.
- `roundTo` is the one rounding helper, `roundText` is the one number-to-text helper, and `overlapBox` is the one rectangle overlap helper. Reuse them.
- Colors are tokens at the top of `styles.css`. A new token needs a light value and a dark value, and the dark values only change the page. The plan drawing area keeps the light palette for walls, rooms, and items (it re-declares it), and only its sheet and the labels around it use the `--plan-*` tokens, which dark mode swaps for a muted gray set. Printing is always light. Do not hardcode a color in a page rule.
- Keep code simple and readable. Comments explain why, not what.

## Git and pull requests

- Work on the branch the session names. Never push to `main` directly. Do not force push unless the user says to.
- If the branch's pull request has been merged, restart the branch from the latest `main` before new work.
- Do not create a pull request unless asked. The user creates them from the GitHub button.
- Commit messages describe what actually changed. Do not add `Co-Authored-By` or session link lines.

### Pull request descriptions

Whenever you push code and an open pull request exists for the branch, update its title and description so they are accurate. If no pull request exists yet, put a ready-to-paste title and description in your reply instead. A merged pull request cannot be corrected, so do this before it is merged.

- **Title:** short and specific. For a regular merge it becomes the body of the merge commit.
- **Description:** plain language, covering what changed, any behavior the user will notice (for example a new warning or a different key step), and what was tested and what was not. Do not hide a behavior change under "merged duplicate code".
- Keep it current. If more commits are pushed to the same pull request, update the description again.
