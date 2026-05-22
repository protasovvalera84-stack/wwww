/**
 * NexaLink Private Media Storage — Linux (WhatsApp model).
 *
 * All media (photos, videos, audio, GIFs) is stored in:
 *   ~/.local/share/nexalink/media/<roomId>/<filename>
 *
 * This directory is:
 *   - chmod 0700: readable only by the owner
 *   - NOT in ~/Downloads or ~/Pictures (not shared)
 *   - Auto-cleaned on account wipe
 *
 * WhatsApp stores media in app-private directories for the same reasons.
 */
#include "media_storage.h"
#include <string.h>
#include <sys/stat.h>

/**
 * Get the root private media directory.
 * Returns a newly allocated string; caller must g_free().
 */
char *media_storage_root(void) {
    char *root = g_build_filename(g_get_user_data_dir(), "nexalink", "media", NULL);
    g_mkdir_with_parents(root, 0700);
    return root;
}

/**
 * Get the media subdirectory for a room.
 * Sanitises room_id to avoid path traversal.
 * Returns a newly allocated string; caller must g_free().
 */
char *media_storage_room_dir(const char *room_id) {
    /* Sanitise: replace anything that isn't alphanumeric/colon/dot/dash/underscore */
    GString *safe = g_string_new(NULL);
    for (const char *p = room_id; *p; p++) {
        if (g_ascii_isalnum(*p) || *p == ':' || *p == '.' || *p == '-' || *p == '_')
            g_string_append_c(safe, *p);
        else
            g_string_append_c(safe, '_');
    }
    char *root = media_storage_root();
    char *dir = g_build_filename(root, safe->str, NULL);
    g_string_free(safe, TRUE);
    g_free(root);
    g_mkdir_with_parents(dir, 0700);
    return dir;
}

/**
 * Resolve a unique file path for storing a media item.
 * If the file already exists, appends a numeric suffix.
 * Returns a newly allocated absolute path; caller must g_free().
 */
char *media_storage_resolve_path(const char *room_id, const char *filename) {
    char *dir = media_storage_room_dir(room_id);

    /* Sanitise filename */
    GString *safe = g_string_new(NULL);
    for (const char *p = filename; *p; p++) {
        if (g_ascii_isalnum(*p) || *p == '.' || *p == '-' || *p == '_' || *p == '(' || *p == ')')
            g_string_append_c(safe, *p);
        else
            g_string_append_c(safe, '_');
    }

    char *path = g_build_filename(dir, safe->str, NULL);
    g_free(dir);

    /* If file already exists, add a suffix */
    int n = 1;
    while (g_file_test(path, G_FILE_TEST_EXISTS)) {
        g_free(path);
        const char *dot = g_strrstr(safe->str, ".");
        char *newname;
        if (dot) {
            char *base = g_strndup(safe->str, dot - safe->str);
            newname = g_strdup_printf("%s(%d)%s", base, n, dot);
            g_free(base);
        } else {
            newname = g_strdup_printf("%s(%d)", safe->str, n);
        }
        char *new_dir = media_storage_room_dir(room_id);
        path = g_build_filename(new_dir, newname, NULL);
        g_free(new_dir);
        g_free(newname);
        n++;
    }

    g_string_free(safe, TRUE);
    return path;
}

/**
 * Delete all media for a room (e.g. on chat deletion).
 */
void media_storage_delete_room(const char *room_id) {
    char *dir = media_storage_room_dir(room_id);
    /* Remove all files in the directory */
    GDir *d = g_dir_open(dir, 0, NULL);
    if (d) {
        const char *name;
        while ((name = g_dir_read_name(d))) {
            char *path = g_build_filename(dir, name, NULL);
            g_remove(path);
            g_free(path);
        }
        g_dir_close(d);
    }
    g_rmdir(dir);
    g_free(dir);
}

/**
 * Delete all cached media (called on logout / account wipe).
 */
void media_storage_delete_all(void) {
    char *root = media_storage_root();
    /* Recursively remove everything under the media root */
    GDir *d = g_dir_open(root, 0, NULL);
    if (d) {
        const char *room;
        while ((room = g_dir_read_name(d))) {
            char *rdir = g_build_filename(root, room, NULL);
            GDir *rd = g_dir_open(rdir, 0, NULL);
            if (rd) {
                const char *file;
                while ((file = g_dir_read_name(rd))) {
                    char *fp = g_build_filename(rdir, file, NULL);
                    g_remove(fp); g_free(fp);
                }
                g_dir_close(rd);
            }
            g_rmdir(rdir); g_free(rdir);
        }
        g_dir_close(d);
    }
    g_rmdir(root);
    g_free(root);
}
