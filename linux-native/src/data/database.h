/**
 * SQLite local database — rooms, messages, media cache.
 */
#ifndef DATABASE_H
#define DATABASE_H
#include <sqlite3.h>
#include <glib.h>

typedef struct _NexaLinkDB NexaLinkDB;

typedef struct {
    char *room_id, *name, *avatar_url, *topic, *last_message;
    gint64 last_message_time;
    int unread_count, is_direct;
} DBRoom;

typedef struct {
    char *event_id, *room_id, *sender, *body, *msgtype, *media_url;
    gint64 timestamp;
} DBMessage;

NexaLinkDB *nexalink_db_new(void);
void nexalink_db_free(NexaLinkDB *db);
void nexalink_db_upsert_room(NexaLinkDB *db, DBRoom *room);
GList *nexalink_db_get_rooms(NexaLinkDB *db);
void nexalink_db_upsert_message(NexaLinkDB *db, DBMessage *msg);
GList *nexalink_db_get_messages(NexaLinkDB *db, const char *room_id, int limit);
void nexalink_db_clear(NexaLinkDB *db);
void db_room_free(DBRoom *r);
void db_message_free(DBMessage *m);
#endif
