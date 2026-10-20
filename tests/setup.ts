import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Polyfill File.prototype.text for jsdom (used by SnapshotDiffPanel)
if (!File.prototype.text) {
  File.prototype.text = async function () {
    return new TextDecoder().decode(await this.arrayBuffer());
  };
}

// Polyfill File.prototype.arrayBuffer for jsdom
if (!File.prototype.arrayBuffer) {
  File.prototype.arrayBuffer = async function () {
    return new Uint8Array(this.size).buffer;
  };
}

// Polyfill Blob.prototype.arrayBuffer for jsdom
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = async function () {
    return new Uint8Array(this.size).buffer;
  };
}

// Polyfill Blob.prototype.text for jsdom
if (!Blob.prototype.text) {
  Blob.prototype.text = async function () {
    return new TextDecoder().decode(await this.arrayBuffer());
  };
}

// Vitest does not enable Testing Library's Jest-style auto-cleanup unless
// globals are on — clean up the DOM between component tests explicitly.
afterEach(() => {
  cleanup();
});
