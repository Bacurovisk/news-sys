import assert from "node:assert/strict";
import { test } from "node:test";
import { imageFromFeed } from "../image.ts";

const base = "https://site.com/noticia";

test("imageFromFeed: maior media:content, ignorando avatares pequenos", () => {
  assert.equal(
    imageFromFeed(
      {
        mediaContent: [
          { $: { url: "https://img.com/avatar_100x100.jpg", medium: "image", width: "100" } },
          { $: { url: "https://img.com/foto-640.jpg", medium: "image", width: "640" } },
          { $: { url: "https://img.com/foto-300.jpg", medium: "image", width: "300" } },
        ],
      },
      base,
    ),
    "https://img.com/foto-640.jpg",
  );
  assert.equal(imageFromFeed({ mediaContent: [{ $: { url: "https://img.com/a.jpg", width: "100", type: "image/jpeg" } }] }, base), null);
});

test("imageFromFeed: enclosure de imagem e primeira <img> da description", () => {
  assert.equal(imageFromFeed({ enclosure: { url: "https://img.com/e.jpg", type: "image/jpeg" } }, base), "https://img.com/e.jpg");
  assert.equal(imageFromFeed({ enclosure: { url: "https://x.com/a.mp3", type: "audio/mpeg" } }, base), null);
  assert.equal(imageFromFeed({ content: '<p>x</p><img src="/rel.png">' }, base), "https://site.com/rel.png");
  assert.equal(imageFromFeed({ content: '<img src="javascript:alert(1)">' }, base), null);
});
