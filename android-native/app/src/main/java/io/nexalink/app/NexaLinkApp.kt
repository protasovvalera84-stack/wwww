package io.nexalink.app

import android.app.Application
import io.nexalink.app.data.NexaLinkDatabase

/**
 * NexaLink Application — инициализирует ядро приложения.
 *
 * Хранит ссылки на базу данных (SQLCipher) и настройки сервера.
 * Сетевые клиенты (Matrix API) инициализируются в WebViewActivity
 * через web-приложение (IndexedDB + JavaScript SDK).
 */
class NexaLinkApp : Application() {

    lateinit var database: NexaLinkDatabase
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this

        // Инициализировать зашифрованную базу данных (SQLCipher + Android Keystore)
        database = NexaLinkDatabase.create(this)
    }

    companion object {
        lateinit var instance: NexaLinkApp
            private set
    }
}
