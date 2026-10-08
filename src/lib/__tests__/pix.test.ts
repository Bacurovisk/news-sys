import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPix, crc16CcittFalse, normalizePixKey } from "../pix.ts";
import { qrSvg } from "../qr-svg.ts";

const pix = { keyType: "RANDOM" as const, key: " 123E4567-E89B-12D3-A456-426614174000 ", name: "João da Silva", city: "Manaus" };

test("CRC-16/CCITT-FALSE: valor de verificação oficial", () => {
  assert.equal(crc16CcittFalse("123456789"), "29B1");
});

test("buildPix: campos EMV, sem acento, com e sem valor, CRC válido", () => {
  const free = buildPix({ ...pix, description: "neojr news" });
  assert.match(free, /^000201/);
  assert.ok(free.includes("0014BR.GOV.BCB.PIX0136123e4567-e89b-12d3-a456-426614174000"));
  assert.ok(free.includes("0210neojr news"));
  assert.ok(free.includes("5913JOAO DA SILVA6006MANAUS"));
  assert.ok(!free.includes("54"+"04"), "valor livre não tem o campo 54");
  assert.equal(free.slice(-4), crc16CcittFalse(free.slice(0, -4)));

  const ten = buildPix({ ...pix, amount: 10 });
  assert.ok(ten.includes("540510.00"));
  assert.equal(ten.slice(-4), crc16CcittFalse(ten.slice(0, -4)));
});

test("normalizePixKey", () => {
  assert.equal(normalizePixKey("PHONE", "(92) 99999-0000"), "+5592999990000");
  assert.equal(normalizePixKey("CPF", "123.456.789-09"), "12345678909");
});

test("qrSvg: matriz com margem e só comandos de path", () => {
  const { size, path } = qrSvg(buildPix(pix));
  assert.ok(size >= 21 + 8);
  assert.match(path, /^(M\d+ \d+h1v1h-1z)+$/);
});
