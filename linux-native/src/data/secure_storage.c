/**
 * NexaLink Secure Storage — GNOME Keyring (libsecret) implementation.
 *
 * WhatsApp model: sensitive data (access tokens, DB keys) stored in the
 * system keyring, not in plaintext files.  On GNOME/KDE this is backed by
 * hardware-protected storage (if available) and requires the user's login
 * password to unlock.
 *
 * Storage strategy:
 *   - All values stored in the "NexaLink" keyring collection via libsecret.
 *   - In-memory cache avoids repeated keyring lookups.
 *   - Fallback: if the keyring is unavailable (headless server, no D-Bus),
 *     values are written to ~/.local/share/nexalink/.secure/ with chmod 0600.
 *     This is secure for single-user systems but weaker than the keyring.
 */
#include "secure_storage.h"
#include <libsecret/secret.h>
#include <string.h>
#include <stdio.h>

/* Keyring schema for NexaLink secrets */
static const SecretSchema NEXALINK_SCHEMA = {
    "io.nexalink.app.Secret",
    SECRET_SCHEMA_NONE,
    {
        { "key",  SECRET_SCHEMA_ATTRIBUTE_STRING },
        { NULL,   0 },
    }
};

struct _SecureStorage {
    GHashTable *cache;        /* in-memory cache: key -> value */
    gboolean    keyring_ok;   /* TRUE if libsecret is available */
};

/* ============================================================
 * Construction / destruction
 * ============================================================ */

SecureStorage *secure_storage_new(void) {
    SecureStorage *s = g_new0(SecureStorage, 1);
    s->cache = g_hash_table_new_full(g_str_hash, g_str_equal, g_free, (GDestroyNotify)g_free);
    /* Probe whether the secret service is available */
    GError *err = NULL;
    SecretService *svc = secret_service_get_sync(SECRET_SERVICE_NONE, NULL, &err);
    if (svc) {
        s->keyring_ok = TRUE;
        g_object_unref(svc);
    } else {
        s->keyring_ok = FALSE;
        if (err) { g_warning("Keyring unavailable: %s — using file fallback", err->message); g_error_free(err); }
    }
    return s;
}

void secure_storage_free(SecureStorage *s) {
    if (!s) return;
    g_hash_table_destroy(s->cache);
    g_free(s);
}

/* ============================================================
 * File fallback path (chmod 0600)
 * ============================================================ */

static char *fallback_path(const char *key) {
    return g_build_filename(g_get_user_data_dir(), "nexalink", ".secure", key, NULL);
}

static void fallback_set(const char *key, const char *value) {
    char *path = fallback_path(key);
    char *dir  = g_path_get_dirname(path);
    g_mkdir_with_parents(dir, 0700);  /* directory: only owner can enter */
    g_free(dir);
    /* Write with restrictive permissions */
    FILE *f = fopen(path, "w");
    if (f) {
        fputs(value, f);
        fclose(f);
        g_chmod(path, 0600);  /* file: owner read/write only */
    }
    g_free(path);
}

static char *fallback_get(const char *key) {
    char *path = fallback_path(key);
    char *value = NULL;
    gsize len = 0;
    g_file_get_contents(path, &value, &len, NULL);
    g_free(path);
    return value; /* caller must g_free() */
}

static void fallback_delete(const char *key) {
    char *path = fallback_path(key);
    g_remove(path);
    g_free(path);
}

/* ============================================================
 * Public API — keyring first, file fallback
 * ============================================================ */

void secure_storage_set(SecureStorage *s, const char *key, const char *value) {
    /* Update in-memory cache */
    g_hash_table_replace(s->cache, g_strdup(key), g_strdup(value));

    if (s->keyring_ok) {
        GError *err = NULL;
        secret_password_store_sync(
            &NEXALINK_SCHEMA,
            SECRET_COLLECTION_DEFAULT,
            "NexaLink credential",  /* label visible in Seahorse/Keychain */
            value,
            NULL,   /* cancellable */
            &err,
            "key", key,
            NULL
        );
        if (err) {
            g_warning("Keyring store failed for '%s': %s — using file", key, err->message);
            g_error_free(err);
            fallback_set(key, value);
        }
    } else {
        fallback_set(key, value);
    }
}

const char *secure_storage_get(SecureStorage *s, const char *key) {
    /* Check in-memory cache first */
    const char *cached = g_hash_table_lookup(s->cache, key);
    if (cached) return cached;

    char *value = NULL;

    if (s->keyring_ok) {
        GError *err = NULL;
        value = secret_password_lookup_sync(
            &NEXALINK_SCHEMA,
            NULL,
            &err,
            "key", key,
            NULL
        );
        if (err) {
            g_warning("Keyring lookup failed for '%s': %s — trying file", key, err->message);
            g_error_free(err);
        }
    }

    /* Fallback to file if keyring unavailable or returned nothing */
    if (!value) {
        value = fallback_get(key);
    }

    if (value) {
        g_hash_table_replace(s->cache, g_strdup(key), value); /* cache owns 'value' now */
        return g_hash_table_lookup(s->cache, key);
    }
    return NULL;
}

void secure_storage_clear(SecureStorage *s) {
    /* Clear in-memory cache */
    g_hash_table_remove_all(s->cache);

    if (s->keyring_ok) {
        /* Remove all NexaLink secrets from keyring */
        const char *keys[] = {
            "access_token", "user_id", "device_id", "server_url", "db_key", NULL
        };
        for (int i = 0; keys[i]; i++) {
            GError *err = NULL;
            secret_password_clear_sync(&NEXALINK_SCHEMA, NULL, &err, "key", keys[i], NULL);
            if (err) g_error_free(err);
        }
    }

    /* Also remove file fallback */
    char *dir = g_build_filename(g_get_user_data_dir(), "nexalink", ".secure", NULL);
    GDir *d = g_dir_open(dir, 0, NULL);
    if (d) {
        const char *name;
        while ((name = g_dir_read_name(d))) {
            char *p = g_build_filename(dir, name, NULL);
            g_remove(p);
            g_free(p);
        }
        g_dir_close(d);
    }
    g_free(dir);
}
