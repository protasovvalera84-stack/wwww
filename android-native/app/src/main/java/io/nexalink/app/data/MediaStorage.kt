package io.nexalink.app.data

import android.content.Context
import java.io.File
import java.io.InputStream

/**
 * NexaLink Private Media Storage — WhatsApp model.
 *
 * All media (photos, videos, audio, GIFs) is stored in the app's PRIVATE
 * files directory:  context.filesDir/media/<roomId>/<filename>
 *
 * This directory is:
 *   - App-private: other apps CANNOT access it (no READ_EXTERNAL_STORAGE needed)
 *   - Auto-deleted on uninstall
 *   - NOT backed up by default (no cloud leakage of media)
 *   - Not visible in Android's Downloads or Gallery apps
 *
 * WhatsApp stores media in app-private storage for the same reasons.
 * Users can manually share from within the app if they choose.
 *
 * Contrast with the OLD (wrong) approach:
 *   - Storing in Environment.DIRECTORY_DOWNLOADS  ← PUBLIC, any app can read
 *   - Storing in MediaStore  ← PUBLIC, shows in Gallery
 */
object MediaStorage {

    /**
     * Get the root media directory.  Created if it doesn't exist.
     * Path: /data/data/io.nexalink.app/files/media/
     */
    fun mediaRoot(context: Context): File {
        return File(context.filesDir, "media").also { it.mkdirs() }
    }

    /**
     * Get the media subdirectory for a specific room.
     * Path: /data/data/io.nexalink.app/files/media/<roomId>/
     */
    fun roomDir(context: Context, roomId: String): File {
        // Sanitise roomId to avoid path traversal
        val safe = roomId.replace(Regex("[^a-zA-Z0-9:._-]"), "_")
        return File(mediaRoot(context), safe).also { it.mkdirs() }
    }

    /**
     * Resolve a file path for storing a media item.
     * If the file already exists, a numeric suffix is appended.
     */
    fun resolveFilePath(context: Context, roomId: String, filename: String): File {
        val dir = roomDir(context, roomId)
        var file = File(dir, sanitize(filename))
        var i = 1
        while (file.exists()) {
            val ext = filename.substringAfterLast('.', "")
            val base = filename.substringBeforeLast('.')
            val name = if (ext.isNotEmpty()) "$base($i).$ext" else "$base($i)"
            file = File(dir, sanitize(name))
            i++
        }
        return file
    }

    /**
     * Write a media stream to private storage.
     * Returns the absolute path of the saved file.
     *
     * The caller is responsible for decrypting the stream before passing it here
     * (AES-256-CTR decryption of the encrypted blob from the server).
     */
    fun saveMedia(
        context: Context,
        roomId: String,
        filename: String,
        stream: InputStream,
    ): String {
        val dest = resolveFilePath(context, roomId, filename)
        dest.outputStream().use { out -> stream.copyTo(out) }
        // File is in app-private storage — chmod is already restricted by Android sandbox
        return dest.absolutePath
    }

    /**
     * Delete all media for a room.
     * Call when the user leaves or deletes a chat.
     */
    fun deleteRoomMedia(context: Context, roomId: String) {
        roomDir(context, roomId).deleteRecursively()
    }

    /**
     * Delete all cached media (e.g. on logout / account wipe).
     */
    fun deleteAllMedia(context: Context) {
        mediaRoot(context).deleteRecursively()
    }

    /**
     * Total size of locally cached media in bytes.
     */
    fun totalSize(context: Context): Long {
        return mediaRoot(context).walkBottomUp()
            .filter { it.isFile }
            .sumOf { it.length() }
    }

    private fun sanitize(name: String): String =
        name.replace(Regex("[^a-zA-Z0-9._()-]"), "_").take(200)
}
