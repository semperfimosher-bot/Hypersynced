const state = {
  searchQuery: "",
  category: null,
  folderValue: null,
  selectedTrackIds: new Set(),
};

export function readAdminCatalogState() {
  return {
    searchQuery: state.searchQuery,
    category: state.category,
    folderValue: state.folderValue,
    selectedTrackIds: new Set(state.selectedTrackIds),
  };
}

export function writeAdminCatalogState(next) {
  if (Object.hasOwn(next, "searchQuery")) state.searchQuery = next.searchQuery;
  if (Object.hasOwn(next, "category")) state.category = next.category;
  if (Object.hasOwn(next, "folderValue")) state.folderValue = next.folderValue;
  if (Object.hasOwn(next, "selectedTrackIds")) state.selectedTrackIds = new Set(next.selectedTrackIds);
}
