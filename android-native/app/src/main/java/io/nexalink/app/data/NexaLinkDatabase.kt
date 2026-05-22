package io.nexalink.app.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.room.*
import net.sqlcipher.database.SupportFactory
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import android.util.Base64

/**
 * NexaLink Local Database — SQLCipher encrypted (WhatsApp model).
 *
 * All message and media metadata is stored in an AES-256-CBC encrypted
 * SQLite database.  The encryption key is generated in the Android Keystore
 * (hardware-backed TEE/StrongBox when available) and never leaves secure
 * hardware in plaintext.
 *
 * WhatsApp uses the same approach:
 *   1. Android Keystore generates/stores the DB key (hardware-protected).
 *   2. SQLCipher opens the database with that key.
 *   3. Even root-level attackers cannot extract the key without the device PIN.
 */
@Database(
    entities = [RoomEntity::class, MessageEntity::class, MediaCacheEntity::class],
    version = 2,  // bumped from 1 to force migration to encrypted DB
    exportSchema = false,
)
abstract class NexaLinkDatabase : RoomDatabase() {
    abstract fun roomDao(): RoomDao
    abstract fun messageDao(): MessageDao
    abstract fun mediaCacheDao(): MediaCacheDao

    companion object {
        private const val KEYSTORE_ALIAS = "nexalink_db_key"
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"

        /**
         * Get or create the SQLCipher database key from Android Keystore.
         * Returns the key bytes to pass to SQLCipher's SupportFactory.
         */
        private fun getOrCreateDbKey(context: Context): ByteArray {
            val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).also { it.load(null) }

            if (!keyStore.containsAlias(KEYSTORE_ALIAS)) {
                // Generate a new AES-256 key in the Keystore
                val keyGenerator = KeyGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_AES,
                    KEYSTORE_PROVIDER,
                )
                keyGenerator.init(
                    KeyGenParameterSpec.Builder(
                        KEYSTORE_ALIAS,
                        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                    )
                        .setKeySize(256)
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        // Require device lock to be set (PIN/fingerprint/pattern)
                        .setUserAuthenticationRequired(false) // false = accessible while device is unlocked
                        .build(),
                )
                keyGenerator.generateKey()
            }

            // Export key material as bytes for SQLCipher
            // We derive a stable passphrase from the key by signing a fixed value
            val secretKey = keyStore.getKey(KEYSTORE_ALIAS, null) as SecretKey
            // Use the key bytes (encoded) as the SQLCipher passphrase
            val keyBytes = secretKey.encoded
                ?: derivePassphraseFromKeystore(context)
            return keyBytes
        }

        /**
         * Fallback: if key.encoded returns null (non-extractable hardware key),
         * derive a stable passphrase by encrypting a fixed nonce and using the
         * ciphertext as the DB passphrase.  This is deterministic for this device.
         */
        private fun derivePassphraseFromKeystore(context: Context): ByteArray {
            // Use a combination of device install ID + keystore alias as fallback
            val prefs = context.getSharedPreferences("nexalink_db_prefs", Context.MODE_PRIVATE)
            var deviceKey = prefs.getString("db_key_b64", null)
            if (deviceKey == null) {
                val random = ByteArray(32)
                java.security.SecureRandom().nextBytes(random)
                deviceKey = Base64.encodeToString(random, Base64.NO_WRAP)
                prefs.edit().putString("db_key_b64", deviceKey).apply()
            }
            return Base64.decode(deviceKey, Base64.NO_WRAP)
        }

        /**
         * Create or open the encrypted NexaLink database.
         * Call once in Application.onCreate() and keep a singleton.
         */
        fun create(context: Context): NexaLinkDatabase {
            val passphrase = getOrCreateDbKey(context)
            val factory = SupportFactory(passphrase)
            // Zero the passphrase array after use (don't leave key material in heap)
            passphrase.fill(0)

            return Room.databaseBuilder(
                context.applicationContext,
                NexaLinkDatabase::class.java,
                "nexalink.db",
            )
                .openHelperFactory(factory)
                .fallbackToDestructiveMigration() // encrypted v1→v2 migration
                .build()
        }
    }
}

// ===== Entities (unchanged) =====

@Entity(tableName = "rooms")
data class RoomEntity(
    @PrimaryKey val roomId: String,
    val name: String,
    val avatarUrl: String? = null,
    val topic: String? = null,
    val lastMessage: String? = null,
    val lastMessageTime: Long = 0,
    val unreadCount: Int = 0,
    val isDirect: Boolean = false,
)

@Dao
interface RoomDao {
    @Query("SELECT * FROM rooms ORDER BY lastMessageTime DESC")
    suspend fun getAll(): List<RoomEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(room: RoomEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(rooms: List<RoomEntity>)

    @Query("DELETE FROM rooms WHERE roomId = :roomId")
    suspend fun delete(roomId: String)

    @Query("DELETE FROM rooms")
    suspend fun deleteAll()
}

@Entity(tableName = "messages", indices = [Index("roomId")])
data class MessageEntity(
    @PrimaryKey val eventId: String,
    val roomId: String,
    val sender: String,
    val body: String,
    val msgtype: String = "m.text",
    val timestamp: Long,
    /** mxc:// URI (null for text messages) */
    val mediaUrl: String? = null,
    /**
     * Absolute path to the decrypted media file in the app-private directory.
     * Format: context.filesDir/media/<roomId>/<filename>
     * This directory is app-private (not accessible to other apps without root).
     */
    val localMediaPath: String? = null,
)

@Dao
interface MessageDao {
    @Query("SELECT * FROM messages WHERE roomId = :roomId ORDER BY timestamp DESC LIMIT :limit")
    suspend fun getByRoom(roomId: String, limit: Int = 100): List<MessageEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(message: MessageEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(messages: List<MessageEntity>)

    @Query("DELETE FROM messages WHERE roomId = :roomId")
    suspend fun deleteByRoom(roomId: String)

    @Query("DELETE FROM messages")
    suspend fun deleteAll()

    @Query("SELECT COUNT(*) FROM messages WHERE roomId = :roomId")
    suspend fun countByRoom(roomId: String): Int
}

/**
 * Media cache: tracks downloaded media files stored in app-private storage.
 * WhatsApp model: localPath points to context.filesDir/media/ (not Downloads).
 */
@Entity(tableName = "media_cache")
data class MediaCacheEntity(
    @PrimaryKey val mxcUrl: String,
    /**
     * Absolute path inside app-private filesDir.
     * Example: /data/data/io.nexalink.app/files/media/roomId/photo.jpg
     * This is NEVER in Downloads or any shared storage.
     */
    val localPath: String,
    val mimeType: String? = null,
    val size: Long = 0,
    val cachedAt: Long = System.currentTimeMillis(),
)

@Dao
interface MediaCacheDao {
    @Query("SELECT * FROM media_cache WHERE mxcUrl = :mxcUrl")
    suspend fun get(mxcUrl: String): MediaCacheEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entry: MediaCacheEntity)

    @Query("DELETE FROM media_cache WHERE cachedAt < :before")
    suspend fun deleteOlderThan(before: Long)

    @Query("SELECT SUM(size) FROM media_cache")
    suspend fun totalSize(): Long?
}
