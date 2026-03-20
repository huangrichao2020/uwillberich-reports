# uwillberich-reports

Static hosting repo for `uwillberich` report pages.

Author: 超超
Contact: `grdomai43881@gmail.com`

## Boundary

- this repo owns deployed HTML files only
- this repo serves GitHub Pages output
- this repo does not own A-share report generation logic
- this repo does not own the `uwillberich` skill

## Upstream Source

Report content and HTML source artifacts come from:

- main repo: `https://github.com/huangrichao2020/uwillberich`
- report engine: `skill/uwillberich`
- static source layer: `uwillberich/docs/`

## Expected Contents

- `index.html`
- `reports/*.html`
- `assets/*`
- `.nojekyll`

If another agent needs to generate the daily report itself, it should work in the main `uwillberich` repo and use `skill/uwillberich`. This repo is only the publish target.
