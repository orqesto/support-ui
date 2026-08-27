## Why

<!-- What was wrong, or what the user could not do. Not "add X" — why X. -->

## What

<!-- The change, and any decision a reader would otherwise have to reverse-engineer. -->

## Cross-repo ordering

<!--
⚠️ THIS FRONTEND DEPLOYS TO PRODUCTION THE MOMENT THIS PR IS MERGED.

A push to `main` builds both production and staging from that commit. The backend does
NOT work that way — it goes live on a `v*` tag — so a backend change can sit merged and
unreleased for hours while this half is already in front of users.

That gap has broken this app before: a new backend field read as `field.value` on a build
where the field does not exist yet renders a white screen, not a missing value.

Delete this section if the change is self-contained. Otherwise fill it in:
-->

- **Paired PR:** orqesto/support-service#<n>
- **Which must land first:** <this one | the backend one>
- **Why:** <what breaks if they land the other way round>
- **If this ships first, the old backend responds:** <what the UI does with that response>

## Verified

<!-- What you actually ran or saw, not what should work. -->
