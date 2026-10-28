import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import "./loading.css";

export function LoadingIndicator({
  label = "Loading...",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <span
      className={`loading-indicator${compact ? " loading-compact" : ""}`}
      role="status"
    >
      <span className="loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function LoadingImage({
  src,
  alt,
  className,
  onLoad,
  onError,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  const image = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    const node = image.current;
    if (node?.complete) setState(node.naturalWidth > 0 ? "ready" : "error");
    else setState("loading");
  }, [src]);
  return (
    <span className="loading-image" aria-busy={state === "loading"}>
      <img
        {...props}
        ref={image}
        src={src}
        alt={alt}
        className={className}
        onLoad={(event) => {
          setState("ready");
          onLoad?.(event);
        }}
        onError={(event) => {
          setState("error");
          onError?.(event);
        }}
      />
      {state === "loading" && (
        <span className="loading-image-overlay" aria-hidden="true">
          <LoadingIndicator label="Loading image..." compact />
        </span>
      )}
      {state === "error" && (
        <span
          className="loading-image-overlay loading-image-error"
          role="status"
        >
          Image unavailable{alt ? `: ${alt}` : ""}
        </span>
      )}
    </span>
  );
}
