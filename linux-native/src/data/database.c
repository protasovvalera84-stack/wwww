/**
 * NexaLink Database — SQLCipher encrypted (WhatsApp model).
 *
 * The database key is generated randomly on first run and stored in the
 * system keyring via libsecret.  If SQLCipher is not available at build
 * time (HAVE_SQLCIPHER not defined), falls back to plain SQLite with a
 * compiler warning — NEVER use plain SQLite in production.
 *
 * Media files are stored in app-private directories (see media_storage.c),
 * not in ~/Downloads or any shared location.
 */
#include "database.h"
#include "secure_storage.h"
#include <stdio.h>
#include <string.h>

#ifdef HAVE_SQLCIPHER
  #include <sqlcipher/sqlite3.h>
#else
  #warning "Building WITHOUT SQLCipher — database is NOT encrypted (DEV ONLY)"
  #include <sqlite3.h>
#endif

struct _NexaLinkDB {
    sqlite3 *db;
};

/* ============================================================
 * Database key management
 * ============================================================ */

#define DB_KEY_SECRET_KEY "db_key"

/**
 * Get or create a 256-bit hex database key stored in the keyring.
 * Returns a newly allocated hex string (64 chars); caller must g_free().
 */
static char *get_or_create_db_key(SecureStorage *storage) {
    const char *existing = secure_storage_get(storage, DB_KEY_SECRET_KEY);
    if (existing && strlen(existing) == 64) {
        return g_strdup(existing);
    }

    /* Generate 32 random bytes → 64-char hex key */
    guint8 raw[32];
    if (!g_file_get_contents("/dev/urandom", (gchar **)NULL, NULL, NULL)) {
        /* Use GLib's random as fallback (weaker but functional) */
        for (int i = 0; i < 32; i++) raw[i] = (guint8)(g_random_int() & 0xFF);
    } else {
        FILE *urandom = fopen("/dev/urandom", "rb");
        if (urandom) { (void)fread(raw, 1, 32, urandom); fclose(urandom); }
        else { for (int i = 0; i < 32; i++) raw[i] = (guint8)(g_random_int() & 0xFF); }
    }

    /* Convert to hex string */
    GString *hex = g_string_new(NULL);
    for (int i = 0; i < 32; i++) g_string_append_printf(hex, "%02x", raw[i]);
    memset(raw, 0, sizeof(raw)); /* zero key material */

    char *key = g_string_free(hex, FALSE);
    secure_storage_set(storage, DB_KEY_SECRET_KEY, key);
    return key;
}

/* ============================================================
 * Open database with encryption key
 * ============================================================ */

NexaLinkDB *nexalink_db_new(void) {
    NexaLinkDB *mdb = g_new0(NexaLinkDB, 1);

    char *path = g_build_filename(g_get_user_data_dir(), "nexalink", "nexalink.db", NULL);
    g_mkdir_with_parents(g_path_get_dirname(path), 0700);

    sqlite3_open(path, &mdb->db);
    g_free(path);

#ifdef HAVE_SQLCIPHER
    /* Apply encryption key via PRAGMA key */
    SecureStorage *tmp_storage = secure_storage_new();
    char *key = get_or_create_db_key(tmp_storage);
    secure_storage_free(tmp_storage);

    char *pragma = g_strdup_printf("PRAGMA key = \"x'%s'\"", key);
    int rc = sqlite3_exec(mdb->db, pragma, NULL, NULL, NULL);
    memset(pragma, 0, strlen(pragma)); /* zero key material from heap */
    g_free(pragma);
    memset(key, 0, strlen(key));
    g_free(key);

    if (rc != SQLITE_OK) {
        g_warning("SQLCipher PRAGMA key failed: %s", sqlite3_errmsg(mdb->db));
        sqlite3_close(mdb->db);
        g_free(mdb);
        return NULL;
    }
    /* Set cipher parameters (AES-256-CBC, PBKDF2 SHA-512) */
    sqlite3_exec(mdb->db, "PRAGMA cipher_page_size = 4096;", NULL, NULL, NULL);
    sqlite3_exec(mdb->db, "PRAGMA kdf_iter = 256000;", NULL, NULL, NULL);
    sqlite3_exec(mdb->db, "PRAGMA cipher_hmac_algorithm = HMAC_SHA512;", NULL, NULL, NULL);
    sqlite3_exec(mdb->db, "PRAGMA cipher_kdf_algorithm = PBKDF2_HMAC_SHA512;", NULL, NULL, NULL);
#endif

    /* Create tables */
    sqlite3_exec(mdb->db,
        "CREATE TABLE IF NOT EXISTS rooms ("
            "room_id TEXT PRIMARY KEY, name TEXT, avatar_url TEXT, topic TEXT, "
            "last_message TEXT, last_message_time INTEGER DEFAULT 0, "
            "unread_count INTEGER DEFAULT 0, is_direct INTEGER DEFAULT 0"
        ");"
        "CREATE TABLE IF NOT EXISTS messages ("
            "event_id TEXT PRIMARY KEY, room_id TEXT, sender TEXT, body TEXT, "
            "msgtype TEXT DEFAULT 'm.text', timestamp INTEGER, "
            "media_url TEXT, "
            "local_media_path TEXT" /* app-private path, NOT Downloads */
        ");"
        "CREATE INDEX IF NOT EXISTS idx_msg_room ON messages(room_id);"
        "CREATE TABLE IF NOT EXISTS media_cache ("
            "mxc_url TEXT PRIMARY KEY, "
            "local_path TEXT NOT NULL, " /* app-private path */
            "mime_type TEXT, size INTEGER DEFAULT 0, cached_at INTEGER"
        ");",
        NULL, NULL, NULL);

    return mdb;
}

void nexalink_db_free(NexaLinkDB *db) {
    if (db) {
        sqlite3_close(db->db);
        g_free(db);
    }
}

/* ============================================================
 * Room operations
 * ============================================================ */

void nexalink_db_upsert_room(NexaLinkDB *db, DBRoom *room) {
    sqlite3_stmt *stmt;
    sqlite3_prepare_v2(db->db,
        "INSERT OR REPLACE INTO rooms VALUES (?,?,?,?,?,?,?,?)", -1, &stmt, NULL);
    sqlite3_bind_text(stmt, 1, room->room_id,      -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 2, room->name,          -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 3, room->avatar_url,    -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 4, room->topic,         -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 5, room->last_message,  -1, SQLITE_STATIC);
    sqlite3_bind_int64(stmt, 6, room->last_message_time);
    sqlite3_bind_int(stmt,   7, room->unread_count);
    sqlite3_bind_int(stmt,   8, room->is_direct);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);
}

GList *nexalink_db_get_rooms(NexaLinkDB *db) {
    GList *rooms = NULL;
    sqlite3_stmt *stmt;
    sqlite3_prepare_v2(db->db,
        "SELECT * FROM rooms ORDER BY last_message_time DESC", -1, &stmt, NULL);
    while (sqlite3_step(stmt) == SQLITE_ROW) {
        DBRoom *r = g_new0(DBRoom, 1);
        r->room_id          = g_strdup((const char*)sqlite3_column_text(stmt, 0));
        r->name             = g_strdup((const char*)sqlite3_column_text(stmt, 1));
        r->avatar_url       = sqlite3_column_text(stmt, 2) ? g_strdup((const char*)sqlite3_column_text(stmt, 2)) : NULL;
        r->topic            = sqlite3_column_text(stmt, 3) ? g_strdup((const char*)sqlite3_column_text(stmt, 3)) : NULL;
        r->last_message     = sqlite3_column_text(stmt, 4) ? g_strdup((const char*)sqlite3_column_text(stmt, 4)) : NULL;
        r->last_message_time = sqlite3_column_int64(stmt, 5);
        r->unread_count     = sqlite3_column_int(stmt, 6);
        r->is_direct        = sqlite3_column_int(stmt, 7);
        rooms = g_list_append(rooms, r);
    }
    sqlite3_finalize(stmt);
    return rooms;
}

/* ============================================================
 * Message operations
 * ============================================================ */

void nexalink_db_upsert_message(NexaLinkDB *db, DBMessage *msg) {
    sqlite3_stmt *stmt;
    sqlite3_prepare_v2(db->db,
        "INSERT OR REPLACE INTO messages VALUES (?,?,?,?,?,?,?,?)", -1, &stmt, NULL);
    sqlite3_bind_text(stmt, 1, msg->event_id,       -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 2, msg->room_id,         -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 3, msg->sender,          -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 4, msg->body,            -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 5, msg->msgtype,         -1, SQLITE_STATIC);
    sqlite3_bind_int64(stmt, 6, msg->timestamp);
    sqlite3_bind_text(stmt, 7, msg->media_url,       -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 8, msg->local_media_path,-1, SQLITE_STATIC);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);
}

GList *nexalink_db_get_messages(NexaLinkDB *db, const char *room_id, int limit) {
    GList *msgs = NULL;
    sqlite3_stmt *stmt;
    sqlite3_prepare_v2(db->db,
        "SELECT * FROM messages WHERE room_id=? ORDER BY timestamp DESC LIMIT ?",
        -1, &stmt, NULL);
    sqlite3_bind_text(stmt, 1, room_id, -1, SQLITE_STATIC);
    sqlite3_bind_int(stmt, 2, limit);
    while (sqlite3_step(stmt) == SQLITE_ROW) {
        DBMessage *m = g_new0(DBMessage, 1);
        m->event_id        = g_strdup((const char*)sqlite3_column_text(stmt, 0));
        m->room_id         = g_strdup((const char*)sqlite3_column_text(stmt, 1));
        m->sender          = g_strdup((const char*)sqlite3_column_text(stmt, 2));
        m->body            = g_strdup((const char*)sqlite3_column_text(stmt, 3));
        m->msgtype         = g_strdup((const char*)sqlite3_column_text(stmt, 4));
        m->timestamp       = sqlite3_column_int64(stmt, 5);
        m->media_url       = sqlite3_column_text(stmt, 6) ? g_strdup((const char*)sqlite3_column_text(stmt, 6)) : NULL;
        m->local_media_path = sqlite3_column_text(stmt, 7) ? g_strdup((const char*)sqlite3_column_text(stmt, 7)) : NULL;
        msgs = g_list_append(msgs, m);
    }
    sqlite3_finalize(stmt);
    return msgs;
}

void nexalink_db_clear(NexaLinkDB *db) {
    sqlite3_exec(db->db, "DELETE FROM rooms; DELETE FROM messages;", NULL, NULL, NULL);
}

/* ============================================================
 * Memory cleanup
 * ============================================================ */

void db_room_free(DBRoom *r) {
    if (!r) return;
    g_free(r->room_id); g_free(r->name); g_free(r->avatar_url);
    g_free(r->topic); g_free(r->last_message);
    g_free(r);
}

void db_message_free(DBMessage *m) {
    if (!m) return;
    g_free(m->event_id); g_free(m->room_id); g_free(m->sender);
    g_free(m->body); g_free(m->msgtype); g_free(m->media_url);
    g_free(m->local_media_path);
    g_free(m);
}
