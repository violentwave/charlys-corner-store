"use client";

import * as React from "react";

import { ARTWORK_ACCEPT, ARTWORK_HELP, ARTWORK_MAX_BYTES } from "@/lib/artwork";

export interface FileFieldProps {
  name: string;
  label: string;
  files: File[];
  onChange: (files: File[]) => void;
  multiple?: boolean;
  maxFiles?: number;
  error?: string;
}

export function FileField({ name, label, files, onChange, multiple = false, maxFiles = 1, error }: FileFieldProps) {
  const [clientError, setClientError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const previews = React.useMemo(
    () =>
      files
        .filter((file) => ["image/png", "image/jpeg", "image/webp"].includes(file.type))
        .map((file) => URL.createObjectURL(file)),
    [files],
  );
  React.useEffect(
    () => () => {
      for (const url of previews) URL.revokeObjectURL(url);
    },
    [previews],
  );

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    const tooBig = selected.find((f) => f.size > ARTWORK_MAX_BYTES);
    if (tooBig) {
      setClientError(`${tooBig.name} is larger than 20 MB.`);
      event.target.value = "";
      return;
    }
    const next = multiple ? [...files, ...selected].slice(0, maxFiles) : selected.slice(0, 1);
    if (selected.length > maxFiles && multiple) {
      setClientError(`You can attach at most ${maxFiles} files.`);
    } else {
      setClientError(null);
    }
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
    setClientError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const shownError = clientError ?? error;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-text-1 text-sm font-medium">
        {label}
      </label>
      <input
        ref={inputRef}
        id={name}
        name={name}
        type="file"
        accept={ARTWORK_ACCEPT}
        multiple={multiple}
        onChange={handleChange}
        aria-describedby={`${name}-help`}
        aria-invalid={shownError ? true : undefined}
        className="text-text-2 file:bg-bg-3 file:text-text-1 focus-visible:ring-neon-cyan block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:px-4 file:py-2 focus-visible:ring-2 focus-visible:outline-none"
      />
      <p id={`${name}-help`} className="text-text-3 text-xs">
        {ARTWORK_HELP}
      </p>
      {shownError ? (
        <p role="alert" className="text-danger flex items-center gap-1.5 text-xs">
          <span aria-hidden="true">⚠</span>
          {shownError}
        </p>
      ) : null}
      {files.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="border-border bg-bg-2/60 flex items-center gap-3 rounded-md border p-2"
            >
              {previews[index] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previews[index]} alt="" className="h-10 w-10 rounded object-cover" />
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-text-1 truncate text-sm">{file.name}</span>
                <span className="text-text-3 text-xs">{(file.size / 1024).toFixed(1)} KB</span>
              </div>
              <button
                type="button"
                onClick={() => remove(index)}
                className="text-neon-cyan hover:bg-bg-3 focus-visible:ring-neon-cyan rounded-md px-2 py-1 text-xs focus-visible:ring-2 focus-visible:outline-none"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
