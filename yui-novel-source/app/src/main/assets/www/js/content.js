import { TEXT_A } from './text-a.js';
import { TEXT_B } from './text-b.js';
import { TEXT_C } from './text-c.js';

export const CHAPTER_TEXT = Object.assign({}, TEXT_A, TEXT_B, TEXT_C);

export function getCloudText(bookId, index) {
  const bookText = CHAPTER_TEXT[bookId];
  if (!bookText || !bookText[index]) return null;
  return bookText[index];
}