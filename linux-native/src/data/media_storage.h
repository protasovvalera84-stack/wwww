#ifndef MEDIA_STORAGE_H
#define MEDIA_STORAGE_H
#include <glib.h>

char *media_storage_root(void);
char *media_storage_room_dir(const char *room_id);
char *media_storage_resolve_path(const char *room_id, const char *filename);
void  media_storage_delete_room(const char *room_id);
void  media_storage_delete_all(void);
#endif
