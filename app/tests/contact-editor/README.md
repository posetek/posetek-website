# Independent contact saves regression

Run `app/node_modules/.bin/vite --config app/tests/contact-editor/vite.config.ts
--host 127.0.0.1 --port 4197` from the website root. The fixture uses synthetic
contacts and a local delayed callable stub. It makes no Firebase request.

1. Enter player `(202)-555-0101` and parent `(202)-555-0111`.
2. Save only player. The parent draft must remain unchanged and refresh count
   must remain zero.
3. Save parent. Both saved values must remain visible.
4. Enter new complete values in both fields and save both before the delayed
   responses finish. Both saves must be acknowledged independently.
5. Clear player and save. Parent must remain populated.
6. Enter an incomplete number. Saving must show the validation error.

These reproduce the former sibling-draft loss from the full-profile refresh.
The fixture is outside application source/entries and is never deployed.
