import { warn } from './releaseLog';
import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';

const CAMERA_CACHE_DIRECTORY_NAME = 'Camera';

export async function deletePresencePhotoQuietly(photoUri?: string | null) {
  if (!photoUri) {
    return;
  }

  try {
    const photoFile = new File(photoUri);
    if (photoFile.exists) {
      photoFile.delete();
      return;
    }
  } catch (error) {
    try {
      await LegacyFileSystem.deleteAsync(photoUri, { idempotent: true });
    } catch (deleteError) {
      warn('Failed to delete cached presence photo:', deleteError);
    }
  }
}

export function sweepPresencePhotoCacheQuietly() {
  try {
    const cameraCacheDirectory = new Directory(
      Paths.cache,
      CAMERA_CACHE_DIRECTORY_NAME,
    );

    if (!cameraCacheDirectory.exists) {
      return;
    }

    cameraCacheDirectory.list().forEach(entry => {
      try {
        entry.delete();
      } catch (error) {
        warn('Failed to delete cached presence camera file:', error);
      }
    });
  } catch (error) {
    warn('Failed to sweep cached presence camera photos:', error);
  }
}
