export const RESULTS_SORT_OPTIONS = [
  {
    value: "smart",
    label: "My Smart Sort",
  },
  {
    value: "albums",
    label: "Albums",
  },
  {
    value: "alphabetical",
    label: "Alphabetical Order",
  },
];


function sortText(
  value,
) {
  return String(
    value ?? "",
  )
    .trim()
    .toLocaleLowerCase();
}


function itemTitle(
  item,
) {
  return (
    item?.title ??
    item?.name ??
    item?.username ??
    item?.artist ??
    ""
  );
}


function compareText(
  left,
  right,
) {
  return sortText(
    left,
  ).localeCompare(
    sortText(
      right,
    ),
    undefined,
    {
      numeric: true,
      sensitivity: "base",
    },
  );
}


export function sortResultItems(
  items,
  mode = "smart",
) {
  const source =
    Array.isArray(items)
      ? items
      : [];

  const indexed =
    source.map(
      (
        item,
        index,
      ) => ({
        item,
        index,
      }),
    );

  if (mode === "smart") {
    return [...source];
  }

  if (mode === "librarySmart") {
    return [...indexed]
      .sort((left, right) => {
        const aTime = Date.parse(left.item?.last_played_at ?? left.item?.lastPlayedAt ?? "") || null;
        const bTime = Date.parse(right.item?.last_played_at ?? right.item?.lastPlayedAt ?? "") || null;
        if (aTime === null && bTime === null) return left.index - right.index;
        if (aTime === null) return 1;
        if (bTime === null) return -1;
        return bTime - aTime || left.index - right.index;
      })
      .map(({ item }) => item);
  }

  indexed.sort(
    (
      left,
      right,
    ) => {
      const a =
        left.item;

      const b =
        right.item;

      if (mode === "albums") {
        const albumOrder =
          compareText(
            a?.album,
            b?.album,
          );

        if (
          albumOrder !== 0
        ) {
          return albumOrder;
        }

        const artistOrder =
          compareText(
            a?.artist ??
              a?.owner_username,
            b?.artist ??
              b?.owner_username,
          );

        if (
          artistOrder !== 0
        ) {
          return artistOrder;
        }
      }

      if (
        mode === "alphabetical" ||
        mode === "albums"
      ) {
        const titleOrder =
          compareText(
            itemTitle(
              a,
            ),
            itemTitle(
              b,
            ),
          );

        if (
          titleOrder !== 0
        ) {
          return titleOrder;
        }
      }

      return (
        left.index -
        right.index
      );
    },
  );

  return indexed.map(
    ({ item }) =>
      item,
  );
}
