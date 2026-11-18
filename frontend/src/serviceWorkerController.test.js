import assert from "node:assert/strict";
import test from "node:test";

import {
  waitForServiceWorkerController,
} from "./serviceWorkerController.js";

test("service worker readiness resolves immediately when a controller exists", async () => {
  const serviceWorker = {
    controller: {},
    addEventListener() {
      assert.fail("No listener should be needed for an existing controller.");
    },
  };

  assert.equal(
    await waitForServiceWorkerController(serviceWorker),
    true,
  );
});

test("service worker readiness waits for the first controller change", async () => {
  const serviceWorker = new EventTarget();
  serviceWorker.controller = null;

  const pending = waitForServiceWorkerController(serviceWorker, 100);
  serviceWorker.controller = {};
  serviceWorker.dispatchEvent(new Event("controllerchange"));

  assert.equal(await pending, true);
});

test("service worker readiness gives up when the page is not controlled", async () => {
  const serviceWorker = new EventTarget();
  serviceWorker.controller = null;

  assert.equal(
    await waitForServiceWorkerController(serviceWorker, 5),
    false,
  );
});
