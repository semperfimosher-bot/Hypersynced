export function waitForServiceWorkerController(
  serviceWorker =
    globalThis.navigator?.serviceWorker,
  timeoutMs = 1200,
) {
  if (serviceWorker?.controller) {
    return Promise.resolve(true);
  }

  if (
    typeof serviceWorker?.addEventListener !==
    "function"
  ) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = null;

    const finish = (ready) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
      serviceWorker.removeEventListener?.(
        "controllerchange",
        handleControllerChange,
      );
      resolve(ready);
    };

    const handleControllerChange = () => {
      if (serviceWorker.controller) finish(true);
    };

    serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange,
    );

    timeoutId = setTimeout(
      () => finish(Boolean(serviceWorker.controller)),
      Math.max(0, Number(timeoutMs) || 0),
    );

    // Close the race between the initial check and listener registration.
    if (serviceWorker.controller) finish(true);
  });
}
