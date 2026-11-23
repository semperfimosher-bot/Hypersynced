let visitorDevicesCache = null;
let visitorDevicesCacheUpdatedAt = 0;

export function getVisitorDevicesCache() {
  return visitorDevicesCache;
}

export function setVisitorDevicesCache(value) {
  visitorDevicesCache = value;
  visitorDevicesCacheUpdatedAt = Date.now();
  return value;
}

export function getVisitorDevicesCacheUpdatedAt() {
  return visitorDevicesCacheUpdatedAt;
}
