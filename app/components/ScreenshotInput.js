"use client";

import { useRef } from "react";
import styles from "./ScreenshotInput.module.css";
import { IMAGE_TYPES, MAX_IMAGE_PX, MAX_UPLOAD_FILE_BYTES } from "@/lib/limits";

// Keeps the encoded image comfortably under the server's 700 KB body limit.
const TARGET_BYTES = 450 * 1024;

export const SAMPLE_SCREENSHOTS = [
  { id: "rent", label: "Rent chat", file: "/samples/rent.png" },
  { id: "authority", label: "Officer on a call", file: "/samples/officer.png" },
  { id: "investment", label: "Investment group", file: "/samples/investment.png" },
];

function toBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Checks type and size, downscales so the longest side is at most 1024 px and
 * re-encodes as JPEG. Everything happens in the browser; only the small JPEG is sent.
 */
export async function prepareImage(file) {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Please choose a PNG, JPEG or WebP image.");
  if (file.size > MAX_UPLOAD_FILE_BYTES) throw new Error("This image is larger than 8 MB. Please choose a smaller screenshot.");

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("This file could not be opened as an image.");
  });
  const scale = Math.min(1, MAX_IMAGE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let blob = await toBlob(canvas, 0.8);
  if (blob.size > TARGET_BYTES) blob = await toBlob(canvas, 0.6);
  return {
    mimeType: "image/jpeg",
    data: await toBase64(blob),
    previewUrl: URL.createObjectURL(blob),
    name: file.name,
    width: canvas.width,
    height: canvas.height,
    bytes: blob.size,
  };
}

/** Upload control with preview, Remove button and sample screenshots. */
export default function ScreenshotInput({ image, onImage, onSample, onError, disabled }) {
  const inputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    try {
      onImage(await prepareImage(file));
    } catch (err) {
      onError(err.message);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function loadSample(sample) {
    try {
      const res = await fetch(sample.file);
      if (!res.ok) throw new Error("Could not load the sample screenshot.");
      const blob = await res.blob();
      await handleFile(new File([blob], sample.file.split("/").pop(), { type: blob.type }));
      onSample?.(sample);
    } catch (err) {
      onError(err.message);
    }
  }

  function remove() {
    if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl);
    onImage(null);
  }

  return (
    <div className={styles.box}>
      {image ? (
        <div className={styles.preview}>
          <img src={image.previewUrl} alt="Screenshot to check" />
          <div className={styles.previewInfo}>
            <span>{image.name}</span>
            <span className={styles.muted}>
              {image.width}×{image.height}, {Math.round(image.bytes / 1024)} KB
            </span>
            <button type="button" className={styles.remove} onClick={remove} disabled={disabled}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <label className={styles.drop}>
          <input
            ref={inputRef}
            type="file"
            accept={IMAGE_TYPES.join(",")}
            onChange={(e) => handleFile(e.target.files?.[0])}
            disabled={disabled}
          />
          <span className={styles.dropTitle}>Choose a screenshot</span>
          <span className={styles.muted}>One image, PNG, JPEG or WebP, up to 8 MB. It is shrunk on your device before sending.</span>
        </label>
      )}

      <div className={styles.samples}>
        <span>Try a sample screenshot:</span>
        {SAMPLE_SCREENSHOTS.map((s) => (
          <button key={s.id} type="button" onClick={() => loadSample(s)} disabled={disabled}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
