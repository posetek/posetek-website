# Public showcase artwork

These ten original 4:3 compositions use only the checked-in public samples and approved PoseTek brand artwork identified in `provenance.json`. They are editorial previews, not screenshots of an account or evidence of real athlete improvement. The adjacent page caption must retain each manifest entry's recorded/sample/illustrative qualifier.

The SVG files retain editable geometry and text. Regenerate them and the two WebP sizes from the repository root:

```sh
node scripts/generate-showcase-artwork.mjs
```

The script uses the existing Astro dependency on Sharp. It emits 1200×900 and 600×450 WebP textures, a small runtime manifest at `../showcase-artwork.ts`, and this directory's detailed provenance record. Each provenance entry includes source SHA-256 hashes, a description of the sample transformation, and output hashes. No network asset requests or live page captures are involved.

The runtime manifest explicitly imports the WebP files with `?url` so Astro emits same-origin hashed `/_astro` assets compatible with the guarded marketing build. SVGs and provenance are authoring material and must not be imported into the public JavaScript bundle.

SVG typography uses Arial/Helvetica system sans-serif. Repeated generation is byte-stable in the same Node, Sharp/libvips and font environment; cross-platform font rasterization is not guaranteed to match. Committed WebP pixels carry the reviewed typography without a runtime font dependency.
