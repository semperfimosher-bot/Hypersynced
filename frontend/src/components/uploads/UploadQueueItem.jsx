import { useEffect, useRef, useState } from "react";

import Icon from "../ui/Icon.jsx";

function formatFileSize(bytes) {
  if (!bytes) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
  ];

  const index = Math.min(
    Math.floor(
      Math.log(bytes) /
        Math.log(1024),
    ),
    units.length - 1,
  );

  const value =
    bytes / Math.pow(1024, index);

  return `${value.toFixed(
    index === 0 ? 0 : 1,
  )} ${units[index]}`;
}

function formatDuration(seconds) {
  const minutes = Math.floor(
    seconds / 60,
  );

  const remainingSeconds = Math.round(
    seconds % 60,
  );

  return `${minutes}:${String(
    remainingSeconds,
  ).padStart(2, "0")}`;
}

export default function UploadQueueItem({
  item,
  disabled,
  onUpdate,
  onRemove,
  onCancel,
  onRetry,
}) {
  const [expanded, setExpanded] = useState(false);
  const [animateCompletion, setAnimateCompletion] = useState(false);
  const previousStatusRef = useRef(item.status);

  useEffect(() => {
    if (item.status === "success" && previousStatusRef.current !== "success") {
      setAnimateCompletion(true);
    }
    previousStatusRef.current = item.status;
  }, [item.status]);

  const isUploading =
    item.status === "uploading";

  const isSuccess =
    item.status === "success";

  const isFailed =
    item.status === "failed";

  return (
    <article
      className={
        "upload-queue-item " +
        `upload-queue-item--${item.status}`
      }
    >
      <div className="upload-queue-item__main">
        <div className="upload-queue-item__art">
          {isSuccess ? (
            <svg
              className={`upload-success-wheel ${animateCompletion ? "upload-success-wheel--spin" : ""}`}
              viewBox="0 0 100 100"
              role="img"
              aria-label="Upload complete"
            >
              <polygon points="50.00,4.00 55.09,11.33 61.91,5.57 64.92,13.97 73.00,10.16 73.74,19.06 82.53,17.47 80.94,26.26 89.84,27.00 86.03,35.08 94.43,38.09 88.67,44.91 96.00,50.00 88.67,55.09 94.43,61.91 86.03,64.92 89.84,73.00 80.94,73.74 82.53,82.53 73.74,80.94 73.00,89.84 64.92,86.03 61.91,94.43 55.09,88.67 50.00,96.00 44.91,88.67 38.09,94.43 35.08,86.03 27.00,89.84 26.26,80.94 17.47,82.53 19.06,73.74 10.16,73.00 13.97,64.92 5.57,61.91 11.33,55.09 4.00,50.00 11.33,44.91 5.57,38.09 13.97,35.08 10.16,27.00 19.06,26.26 17.47,17.47 26.26,19.06 27.00,10.16 35.08,13.97 38.09,5.57 44.91,11.33" fill="currentColor" />
              <circle cx="50" cy="50" r="35" fill="var(--hs-surface,#012036)" />
              <path d="M30 51 L44 65 L70 35" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <Icon name="music" size={26} />
          )}
        </div>

        <div className="upload-queue-item__info">
          <strong>
            {item.title}
          </strong>

          <span>
            {item.artist}
            {" • "}
            {item.album}
          </span>

          <small>
            {formatFileSize(
              item.file.size,
            )}
            {" • "}
            {formatDuration(
              item.duration,
            )}
          </small>

          {isSuccess &&
          item.response
            ?.compression
            ?.applied ? (
            <small className="upload-compression-result">
              {item.response.compression.saved_percent}%
              {" smaller • "}
              {formatFileSize(
                item.response.compression.saved_bytes,
              )}
              {" saved in B2"}
            </small>
          ) : null}
        </div>

        <div className="upload-queue-item__status">
          {isUploading ? (
            <span>
              {item.progress}%
            </span>
          ) : isSuccess ? (
            <span>READY</span>
          ) : isFailed ? (
            <span>FAILED</span>
          ) : item.status ===
            "cancelled" ? (
            <span>CANCELLED</span>
          ) : (
            <span>QUEUED</span>
          )}
        </div>
      </div>

      {isUploading ? (
        <div className="upload-progress">
          <i
            style={{
              width: `${item.progress}%`,
            }}
          />
        </div>
      ) : null}

      {item.error ? (
        <p className="upload-item-error">
          {item.error}
        </p>
      ) : null}

      <div className="upload-queue-item__actions">
        <button
          type="button"
          className="upload-item-action"
          disabled={
            disabled ||
            isUploading
          }
          onClick={() => {
            setExpanded(
              (current) => !current,
            );
          }}
        >
          {expanded
            ? "Close"
            : "Edit"}
        </button>

        {isUploading ? (
          <button
            type="button"
            className="upload-item-action"
            onClick={() =>
              onCancel(item.id)
            }
          >
            Cancel
          </button>
        ) : null}

        {isFailed ||
        item.status === "cancelled" ? (
          <button
            type="button"
            className="upload-item-action"
            disabled={disabled}
            onClick={() =>
              onRetry(item.id)
            }
          >
            Retry
          </button>
        ) : null}

        {!isUploading &&
        !isSuccess ? (
          <button
            type="button"
            className="upload-item-action upload-item-action--danger"
            disabled={disabled}
            onClick={() =>
              onRemove(item.id)
            }
          >
            Remove
          </button>
        ) : null}
      </div>

      {expanded ? (
        <div className="upload-metadata-editor">
          <label>
            Title

            <input
              value={item.title}
              disabled={
                disabled ||
                isUploading
              }
              onChange={(event) =>
                onUpdate(item.id, {
                  title:
                    event.target.value,
                })
              }
            />
          </label>

          <label>
            Artist

            <input
              value={item.artist}
              disabled={
                disabled ||
                isUploading
              }
              onChange={(event) =>
                onUpdate(item.id, {
                  artist:
                    event.target.value,
                })
              }
            />
          </label>

          <label>
            Album

            <input
              value={item.album}
              disabled={
                disabled ||
                isUploading
              }
              onChange={(event) =>
                onUpdate(item.id, {
                  album:
                    event.target.value,
                })
              }
            />
          </label>

          <label>
            Genre

            <input
              value={
                item.genre ?? ""
              }
              placeholder="e.g. Country"
              disabled={
                disabled ||
                isUploading
              }
              onChange={(event) =>
                onUpdate(item.id, {
                  genre:
                    event.target.value,
                })
              }
            />
          </label>

          <label>
            Release year

            <input
              type="number"
              min="1900"
              max="2100"
              value={
                item.releaseYear ?? ""
              }
              placeholder="e.g. 2024"
              disabled={
                disabled ||
                isUploading
              }
              onChange={(event) => {
                const value =
                  event.target.value;

                onUpdate(item.id, {
                  releaseYear:
                    value
                      ? Number(value)
                      : null,
                });
              }}
            />
          </label>

          <label>
            Duration

            <input
              type="number"
              min="0"
              value={item.duration}
              disabled={
                disabled ||
                isUploading
              }
              onChange={(event) =>
                onUpdate(item.id, {
                  duration:
                    Number(
                      event.target.value,
                    ) || 0,
                })
              }
            />
          </label>
        </div>
      ) : null}
    </article>
  );
}
