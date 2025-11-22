import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { StoredImage, ImageMetadata, BBox } from '../types';

interface YOLOStudioDB extends DBSchema {
  images: {
    key: string;
    value: StoredImage;
    indexes: { 'status': string };
  };
}

const DB_NAME = 'yolo-studio-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<YOLOStudioDB>> | null = null;

export const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<YOLOStudioDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('images', { keyPath: 'id' });
        store.createIndex('status', 'status');
      },
    });
  }
  return dbPromise;
};

export const dbService = {
  async addImages(images: StoredImage[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction('images', 'readwrite');
    const store = tx.objectStore('images');
    await Promise.all(images.map(img => store.put(img)));
    await tx.done;
  },

  async getAllMetadata(): Promise<ImageMetadata[]> {
    const db = await getDB();
    // We only want metadata, but IDB gets full objects. 
    // For massive datasets, using a cursor is better to avoid loading all blobs into memory.
    const images: ImageMetadata[] = [];
    let cursor = await db.transaction('images').store.openCursor();
    
    while (cursor) {
      const { id, name, width, height, status, annotationCount } = cursor.value;
      images.push({ id, name, width, height, status, annotationCount });
      cursor = await cursor.continue();
    }
    return images;
  },

  async getImage(id: string): Promise<StoredImage | undefined> {
    const db = await getDB();
    return db.get('images', id);
  },

  async updateImageAnnotations(id: string, annotations: BBox[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction('images', 'readwrite');
    const store = tx.objectStore('images');
    const img = await store.get(id);
    if (img) {
      img.annotations = annotations;
      img.annotationCount = annotations.length;
      img.status = annotations.length > 0 ? 'in-progress' : 'unlabeled';
      await store.put(img);
    }
    await tx.done;
  },

  async deleteImages(ids: string[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction('images', 'readwrite');
    const store = tx.objectStore('images');
    await Promise.all(ids.map(id => store.delete(id)));
    await tx.done;
  },

  async clearDatabase(): Promise<void> {
    const db = await getDB();
    await db.clear('images');
  }
};