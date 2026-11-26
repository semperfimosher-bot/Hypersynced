export default function UploadCompletionWheel({ size = 34, animate = false, animationKey = 0, label = "Upload complete" }) {
  return (
    <svg
      key={animationKey}
      className={`upload-success-wheel ${animate ? "upload-success-wheel--spin" : ""}`}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={label}
    >
      <polygon points="50.00,4.00 55.09,11.33 61.91,5.57 64.92,13.97 73.00,10.16 73.74,19.06 82.53,17.47 80.94,26.26 89.84,27.00 86.03,35.08 94.43,38.09 88.67,44.91 96.00,50.00 88.67,55.09 94.43,61.91 86.03,64.92 89.84,73.00 80.94,73.74 82.53,82.53 73.74,80.94 73.00,89.84 64.92,86.03 61.91,94.43 55.09,88.67 50.00,96.00 44.91,88.67 38.09,94.43 35.08,86.03 27.00,89.84 26.26,80.94 17.47,82.53 19.06,73.74 10.16,73.00 13.97,64.92 5.57,61.91 11.33,55.09 4.00,50.00 11.33,44.91 5.57,38.09 13.97,35.08 10.16,27.00 19.06,26.26 17.47,17.47 26.26,19.06 27.00,10.16 35.08,13.97 38.09,5.57 44.91,11.33" fill="currentColor" />
      <circle cx="50" cy="50" r="35" fill="var(--hs-surface,#012036)" />
      <path d="M30 51 L44 65 L70 35" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
