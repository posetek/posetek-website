# Admin contact editor regression

Run the synthetic fixture from the website root.

```sh
app/node_modules/.bin/vite --config app/tests/contact-editor/vite.config.ts --host 127.0.0.1 --port 4197
```

1. Edit both classified numbers and save once. Both values should be normalized
   and acknowledged, and the legacy primary number should be preserved. Toggle
   the profile twice and confirm the saved values are still displayed.
2. Clear the player number and save. The parent number should remain populated.
3. Enter an incomplete player number and edit the parent number. Saving should
   show a validation error before sending either edit.
4. Correct the player input, simulate another edit, and save. The conflict should
   block both edits. Refresh should load the simulated parent number.
5. Edit only the legacy primary number. Inspect fixture state and verify that
   this save uses the original single-phone request.

The fixture renders the actual contact component with a local callable stub.
It uses synthetic contacts and makes no Firebase request.
