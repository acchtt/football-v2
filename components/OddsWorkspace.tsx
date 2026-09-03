"use client";

import { useEffect, useState } from "react";

export function OddsWorkspace() {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <div className="upload">
      <input
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (preview) URL.revokeObjectURL(preview);
          setPreview(URL.createObjectURL(file));
        }}
      />
      {preview && <img className="preview" src={preview} alt="Uploaded bookmaker odds screenshot preview" />}
      <p className="upload-note">
        Screenshot capture is already in the UI. Automatic extraction/verification will be connected to the server route next; the model will never lock from hidden OCR values without a visible verification step.
      </p>
    </div>
  );
}
