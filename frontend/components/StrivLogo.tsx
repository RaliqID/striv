export default function StrivLogo({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Striv"
    >
      {/*
        Mark: an upward "strive" stroke rising out of a solid base, with a
        forward chevron. Reads as progress + momentum rather than a generic
        gym dumbbell, and stays legible at 16px in a browser tab.
      */}
      <rect width="40" height="40" rx="11" fill="#1C1B1B" />

      {/* Rising bar chart: three steps of increasing height. */}
      <rect x="10" y="22" width="4.5" height="8" rx="2.25" fill="#FFFFFF" opacity="0.55" />
      <rect x="17.75" y="17" width="4.5" height="13" rx="2.25" fill="#FFFFFF" opacity="0.8" />
      <rect x="25.5" y="11" width="4.5" height="19" rx="2.25" fill="#FFFFFF" />

      {/* Forward chevron above the tallest bar: direction of travel. */}
      <path
        d="M14.5 14.5L20 9.5L25.5 14.5"
        stroke="#6063EE"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
