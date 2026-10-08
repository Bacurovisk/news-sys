import assert from "node:assert/strict";
import { test } from "node:test";
import { imageFromFeed, usableImage } from "../image.ts";

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

test("usableImage: descarta logo e imagem padrão de compartilhamento", () => {
  assert.equal(usableImage("https://cdn.jsdelivr.net/gh/x/abr/assets/images/logo-agenciabrasil.svg", base), null);
  assert.equal(usableImage("https://www.opovo.com.br/reboot/includes/assets/img/logo_og.webp", base), null);
  assert.equal(usableImage("https://s3.glbimg.com/v1/AUTH_x/static/preview-share-min.png", base), null);
  // "logo" só conta no nome do arquivo, não no caminho
  assert.equal(usableImage("https://img.com/logos/2026/foto.jpg", base), "https://img.com/logos/2026/foto.jpg");
  assert.equal(imageFromFeed({ content: '<img src="/img/logo.png"><img src="/foto.jpg">' }, base), "https://site.com/foto.jpg");
});
