export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(reader.error ?? new Error('The file could not be read.'));
    };
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      resolve(dataUrl.split(',')[1] ?? '');
    };
    reader.readAsDataURL(blob);
  });
}
