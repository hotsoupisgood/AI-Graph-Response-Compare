'use client';

import { useState, useCallback } from 'react';

interface ImageUploaderProps {
  onImageSelect: (base64: string, mediaType: string) => void;
  currentImage: string | null;
  isLoading: boolean;
}

export default function ImageUploader({ onImageSelect, currentImage, isLoading }: ImageUploaderProps) {
  const [mediaType, setMediaType] = useState('image/jpeg');

  const readFile = useCallback((file: File | Blob, type: string) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setMediaType(type);
      onImageSelect(base64, type);
    };
    reader.readAsDataURL(file);
  }, [onImageSelect]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFile(file, file.type);
  }, [readFile]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith('image/')) readFile(file, file.type);
  }, [readFile]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleExampleClick = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const response = await fetch('/example.jpg');
      const blob = await response.blob();
      readFile(blob, 'image/jpeg');
    } catch {
      console.error('Failed to load example image');
    }
  }, [readFile]);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors"
    >
      {currentImage ? (
        <div className="space-y-4">
          <img
            src={`data:${mediaType};base64,${currentImage}`}
            alt="Uploaded plot"
            className="max-h-64 mx-auto rounded"
          />
          <label className="inline-block cursor-pointer text-sm text-gray-600 hover:text-gray-800">
            <span className="underline">Change image</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
              disabled={isLoading}
            />
          </label>
        </div>
      ) : (
        <label className="cursor-pointer block">
          <div className="space-y-2">
            <div className="text-4xl text-gray-400">+</div>
            <div className="text-gray-600">
              Drop a plot image here or <span className="underline">browse</span>
            </div>
            <div className="text-sm text-gray-400">Supports PNG, JPG, GIF, WebP</div>
            <button
              type="button"
              onClick={handleExampleClick}
              disabled={isLoading}
              className="mt-3 text-sm text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
            >
              Try example (CO₂ levels)
            </button>
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            disabled={isLoading}
          />
        </label>
      )}
    </div>
  );
}
